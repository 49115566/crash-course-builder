import { once } from 'node:events';
import type { Server } from 'node:http';

import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE, type SessionEvent } from '@ccb/contracts';
import { apiRequest } from '../test/api-request.js';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeAiProvider } from '../adapters/fake-ai/fake-ai-provider.js';
import { makeTestApp, type TestAppContext } from '../test/library-fixtures.js';

const contexts: TestAppContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
});

async function listen(context: TestAppContext): Promise<{ server: Server; baseUrl: string }> {
  const server = context.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing server address.');
  return { server, baseUrl: `http://127.0.0.1:${String(address.port)}` };
}

function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: SessionEvent) => void,
  onError: (error: unknown) => void,
): void {
  const decoder = new TextDecoder();
  let buffer = '';
  const dataLines: string[] = [];

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          if (line === '') {
            if (dataLines.length > 0) {
              onEvent(JSON.parse(dataLines.join('\n')) as SessionEvent);
            }
            dataLines.length = 0;
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
          newline = buffer.indexOf('\n');
        }
      }
    } catch (error) {
      onError(error);
    }
  })();
}

async function waitForEvent(
  events: SessionEvent[],
  predicate: (event: SessionEvent) => boolean,
  timeoutMs = 5_000,
): Promise<SessionEvent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = events.find(predicate);
    if (match !== undefined) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for SSE event. Received: ${events.map((e) => e.type).join(', ')}`,
  );
}

async function createSetup(
  context: TestAppContext,
): Promise<{ subjectId: string; sessionId: string }> {
  const subject = await apiRequest(context.app)
    .post('/api/subjects')
    .send({ name: 'Computer Science' })
    .expect(201);
  const subjectId = (subject.body as { data: { subject: { id: string } } }).data.subject.id;
  const session = await apiRequest(context.app)
    .post('/api/sessions')
    .send({ subjectId, topic: 'Vector Databases', audience: 'software engineers' })
    .expect(201);
  return {
    subjectId,
    sessionId: (session.body as { data: { session: { id: string } } }).data.session.id,
  };
}

describe('session event stream', () => {
  it('sends a snapshot, coalesced outline deltas, and outline_ready', async () => {
    const context = await makeTestApp(
      {},
      { provider: new FakeAiProvider({ chunkSize: 8, delayMs: 4 }) },
    );
    contexts.push(context);
    const { server, baseUrl } = await listen(context);
    const { sessionId } = await createSetup(context);
    const controller = new AbortController();
    const events: SessionEvent[] = [];
    let readError: unknown;

    try {
      const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/events`, {
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error('Missing SSE body.');
      readEvents(
        reader,
        (event) => events.push(event),
        (error) => {
          readError = error;
        },
      );

      const snapshot = await waitForEvent(events, (event) => event.type === 'snapshot');
      expect(snapshot.type === 'snapshot' && snapshot.session.status).toBe('draft');

      const start = await fetch(`${baseUrl}/api/sessions/${sessionId}/outline`, {
        method: 'POST',
        headers: { [MUTATION_HEADER_NAME]: MUTATION_HEADER_VALUE },
      });
      expect(start.status).toBe(202);
      await waitForEvent(events, (event) => event.type === 'outline_ready');
      if (readError !== undefined) {
        throw readError instanceof Error ? readError : new Error('The SSE reader failed.');
      }

      expect(events.some((event) => event.type === 'outline_delta')).toBe(true);
      expect(events.some((event) => event.type === 'status')).toBe(true);
      const deltas = events.filter((event) => event.type === 'outline_delta');
      const combined = deltas
        .map((event) => (event.type === 'outline_delta' ? event.text : ''))
        .join('');
      expect(combined).toContain('Foundations');
    } finally {
      controller.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
});
