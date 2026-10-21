import { describe, expect, it, vi } from 'vitest';

import type { AiChunk } from '../../ports/ai-provider.js';
import { DeepSeekProvider } from './deepseek-provider.js';
import { parseSseStream, type SseMessage } from './sse-parser.js';

const PROMPT = { system: 'System.', user: 'User.' };

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
}

function responseOf(parts: string[], status = 200): Response {
  return new Response(streamOf(parts), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function event(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function collect(stream: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const chunks: AiChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('parseSseStream', () => {
  it('reassembles events split across arbitrary chunks', async () => {
    const messages: SseMessage[] = [];
    const stream = streamOf([
      ': comment\r\n',
      'event: mes',
      'sage\r\ndata: hel',
      'lo\r\ndata: world\r',
      '\n\r\n',
      'data: [DONE]\n\n',
    ]);

    for await (const message of parseSseStream(stream)) messages.push(message);

    expect(messages).toEqual([{ event: 'message', data: 'hello\nworld' }, { data: '[DONE]' }]);
  });
});

describe('DeepSeekProvider', () => {
  it('streams content and usage through the OpenAI-compatible format', async () => {
    const fetchImpl = vi.fn(async () =>
      responseOf([
        event({ choices: [{ delta: { role: 'assistant' } }] }),
        event({ choices: [{ delta: { content: 'Hello ' } }] }),
        event({ choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }] }),
        event({
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        }),
        'data: [DONE]\n\n',
      ]),
    );
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl,
    });

    const chunks = await collect(
      provider.streamOutline({ prompt: PROMPT }, new AbortController().signal),
    );

    expect(chunks.map((chunk) => chunk.text).join('')).toBe('Hello world');
    expect(chunks.at(-2)?.finishReason).toBe('stop');
    expect(chunks.at(-1)?.usage).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = (fetchImpl.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: 'Bearer secret' });
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: 'deepseek-chat',
      stream: true,
    });
  });

  it('treats null usage on normal chunks as absent', async () => {
    const fetchImpl = vi.fn(async () =>
      responseOf([
        event({
          choices: [{ delta: { role: 'assistant', content: '' }, finish_reason: null }],
          usage: null,
        }),
        event({ choices: [{ delta: { content: 'Hello ' } }], usage: null }),
        event({ choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }], usage: null }),
        'data: [DONE]\n\n',
      ]),
    );
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl,
    });

    const chunks = await collect(
      provider.streamOutline({ prompt: PROMPT }, new AbortController().signal),
    );

    expect(chunks.map((chunk) => chunk.text).join('')).toBe('Hello world');
    expect(chunks.at(-1)?.finishReason).toBe('stop');
    expect(chunks.every((chunk) => chunk.usage === undefined)).toBe(true);
  });

  it('maps HTTP failures without retrying', async () => {
    const cases = [
      [401, 'AI_AUTH_INVALID'],
      [402, 'AI_INSUFFICIENT_BALANCE'],
      [429, 'AI_RATE_LIMITED'],
      [503, 'AI_UPSTREAM'],
    ] as const;

    for (const [status, code] of cases) {
      const fetchImpl = vi.fn(async () => responseOf([], status));
      const provider = new DeepSeekProvider({
        baseUrl: 'https://example.test',
        model: 'deepseek-chat',
        getApiKey: async () => 'secret',
        fetchImpl,
      });

      await expect(
        collect(
          provider.streamSection(
            { prompt: PROMPT, sectionNumber: 1, sectionTitle: 'One' },
            new AbortController().signal,
          ),
        ),
      ).rejects.toMatchObject({ code });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it('rejects malformed streams as upstream errors', async () => {
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl: async () => responseOf(['data: not-json\n\n']),
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });

  it('reports a missing key before making a request', async () => {
    const fetchImpl = vi.fn();
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => null,
      fetchImpl,
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'KEY_MISSING' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('times out when the first byte never arrives', async () => {
    const never = new ReadableStream<Uint8Array>({
      start() {
        // Intentionally never enqueues or closes.
      },
    });
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl: async () => new Response(never, { status: 200 }),
      timeouts: { firstByteMs: 5, idleMs: 5, absoluteMs: 50 },
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });

  it('times out when the stream stalls between chunks', async () => {
    const encoder = new TextEncoder();
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(event({ choices: [{ delta: { content: 'first' } }] })));
      },
    });
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl: async () => new Response(stalled, { status: 200 }),
      timeouts: { firstByteMs: 50, idleMs: 5, absoluteMs: 200 },
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });

  it('maps network failures without retrying', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl,
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, new AbortController().signal)),
    ).rejects.toMatchObject({ code: 'AI_NETWORK', retryable: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('distinguishes caller cancellation from provider failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return responseOf([]);
    });
    const provider = new DeepSeekProvider({
      baseUrl: 'https://example.test',
      model: 'deepseek-chat',
      getApiKey: async () => 'secret',
      fetchImpl,
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, controller.signal)),
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
  });
});
