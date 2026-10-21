import { describe, expect, it } from 'vitest';

import { AiProviderError } from '../../domain/ai-errors.js';
import type { AiChunk, AiPrompt } from '../../ports/ai-provider.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { FAKE_OUTLINE_MARKDOWN, fakeSectionMarkdown } from './fixtures.js';

const PROMPT: AiPrompt = {
  system: 'You are a test system prompt.',
  user: 'Write a test response.',
};

const SECTION_PROMPT: AiPrompt = {
  system: 'You are a section writer.',
  user: 'Write section two.',
};

async function collect(stream: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const chunks: AiChunk[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return chunks;
}

describe('FakeAiProvider', () => {
  it('streams a deterministic outline whose chunks concatenate exactly', async () => {
    const provider = new FakeAiProvider({ chunkSize: 17 });
    const chunks = await collect(
      provider.streamOutline({ prompt: PROMPT }, new AbortController().signal),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(FAKE_OUTLINE_MARKDOWN);
    expect(chunks.at(-1)?.finishReason).toBe('stop');
    const usage = chunks.at(-1)?.usage;
    expect(usage).toBeDefined();
    expect(typeof usage?.promptTokens).toBe('number');
    expect(typeof usage?.completionTokens).toBe('number');
    expect(typeof usage?.totalTokens).toBe('number');
    expect(usage?.totalTokens).toBe((usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0));
    expect(chunks.slice(0, -1).every((chunk) => chunk.usage === undefined)).toBe(true);
  });

  it('streams section content using the supplied number and title', async () => {
    const provider = new FakeAiProvider({ chunkSize: 11 });
    const input = {
      prompt: SECTION_PROMPT,
      sectionNumber: 2,
      sectionTitle: 'Indexing',
    };
    const chunks = await collect(provider.streamSection(input, new AbortController().signal));
    const text = chunks.map((chunk) => chunk.text).join('');

    expect(text).toBe(fakeSectionMarkdown(input));
    expect(text.startsWith('## 2. Indexing')).toBe(true);
  });

  it('is deterministic across calls', async () => {
    const provider = new FakeAiProvider({ chunkSize: 9 });
    const first = await collect(
      provider.streamOutline({ prompt: PROMPT }, new AbortController().signal),
    );
    const second = await collect(
      provider.streamOutline({ prompt: PROMPT }, new AbortController().signal),
    );

    expect(first).toEqual(second);
  });

  it('aborts during streaming with AI_ABORTED', async () => {
    const provider = new FakeAiProvider({ chunkSize: 8, delayMs: 10 });
    const controller = new AbortController();
    const iterator = provider
      .streamOutline({ prompt: PROMPT }, controller.signal)
      [Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    controller.abort();

    await expect(iterator.next()).rejects.toMatchObject({ code: 'AI_ABORTED' });
  });

  it('preserves chunks emitted before an injected failure', async () => {
    const provider = new FakeAiProvider({
      chunkSize: 10,
      failure: { scope: 'outline', afterChunks: 2, code: 'AI_TIMEOUT', message: 'Timed out.' },
    });
    const received: string[] = [];

    await expect(async () => {
      for await (const chunk of provider.streamOutline(
        { prompt: PROMPT },
        new AbortController().signal,
      )) {
        received.push(chunk.text);
      }
    }).rejects.toMatchObject({ code: 'AI_TIMEOUT', message: 'Timed out.' });

    expect(received).toHaveLength(2);
    expect(received.join('')).toBe(FAKE_OUTLINE_MARKDOWN.slice(0, 20));
  });

  it('can fail before emitting any content', async () => {
    const provider = new FakeAiProvider({
      chunkSize: 10,
      failure: { scope: 'outline', afterChunks: 0 },
    });

    await expect(
      collect(provider.streamOutline({ prompt: PROMPT }, new AbortController().signal)),
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('targets a specific section without affecting the others', async () => {
    const provider = new FakeAiProvider({
      chunkSize: 20,
      failure: { scope: 'section', sectionNumber: 2, afterChunks: 1 },
    });

    const first = await collect(
      provider.streamSection(
        { prompt: SECTION_PROMPT, sectionNumber: 1, sectionTitle: 'Foundations' },
        new AbortController().signal,
      ),
    );
    expect(first.length).toBeGreaterThan(1);

    await expect(
      collect(
        provider.streamSection(
          { prompt: SECTION_PROMPT, sectionNumber: 2, sectionTitle: 'Indexing' },
          new AbortController().signal,
        ),
      ),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });

  it('fails after all chunks when the failure index is beyond the stream', async () => {
    const provider = new FakeAiProvider({
      chunkSize: 1000,
      failure: { scope: 'outline', afterChunks: 5 },
    });
    const received: string[] = [];

    await expect(async () => {
      for await (const chunk of provider.streamOutline(
        { prompt: PROMPT },
        new AbortController().signal,
      )) {
        received.push(chunk.text);
      }
    }).rejects.toMatchObject({ code: 'AI_UPSTREAM' });

    expect(received.join('')).toBe(FAKE_OUTLINE_MARKDOWN);
  });
});
