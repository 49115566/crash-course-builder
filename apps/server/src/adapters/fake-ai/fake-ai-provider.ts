import type { ErrorCode } from '@ccb/contracts';

import { AiProviderError } from '../../domain/ai-errors.js';
import { estimateTokens } from '../../domain/prompt-builder.js';
import type {
  AiChunk,
  AiPrompt,
  AiProvider,
  OutlineInput,
  SectionInput,
} from '../../ports/ai-provider.js';
import { FAKE_OUTLINE_MARKDOWN, fakeSectionMarkdown } from './fixtures.js';

export interface FakeAiFailure {
  scope: 'outline' | 'section';
  sectionNumber?: number;
  afterChunks: number;
  code?: ErrorCode;
  message?: string;
}

export interface FakeAiProviderOptions {
  outlineMarkdown?: string;
  sectionMarkdown?: (input: SectionInput) => string;
  chunkSize?: number;
  delayMs?: number;
  failure?: FakeAiFailure;
}

export class FakeAiProvider implements AiProvider {
  private readonly outlineMarkdown: string;
  private readonly sectionMarkdown: (input: SectionInput) => string;
  private readonly chunkSize: number;
  private readonly delayMs: number;
  private readonly failure: FakeAiFailure | undefined;

  constructor(options: FakeAiProviderOptions = {}) {
    this.outlineMarkdown = options.outlineMarkdown ?? FAKE_OUTLINE_MARKDOWN;
    this.sectionMarkdown = options.sectionMarkdown ?? fakeSectionMarkdown;
    this.chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 24));
    this.delayMs = Math.max(0, options.delayMs ?? 0);
    this.failure = options.failure;
  }

  streamOutline(input: OutlineInput, signal: AbortSignal): AsyncIterable<AiChunk> {
    return this.stream(this.outlineMarkdown, input.prompt, signal, 'outline');
  }

  streamSection(input: SectionInput, signal: AbortSignal): AsyncIterable<AiChunk> {
    return this.stream(
      this.sectionMarkdown(input),
      input.prompt,
      signal,
      'section',
      input.sectionNumber,
    );
  }

  private async *stream(
    text: string,
    prompt: AiPrompt,
    signal: AbortSignal,
    scope: 'outline' | 'section',
    sectionNumber?: number,
  ): AsyncIterable<AiChunk> {
    const failure = this.matchingFailure(scope, sectionNumber);
    const chunks = splitIntoChunks(text, this.chunkSize);
    const usage = {
      promptTokens: estimateTokens(prompt.system) + estimateTokens(prompt.user),
      completionTokens: estimateTokens(text),
      totalTokens:
        estimateTokens(prompt.system) + estimateTokens(prompt.user) + estimateTokens(text),
    };

    for (const [index, chunk] of chunks.entries()) {
      if (failure !== undefined && index === failure.afterChunks) {
        throw this.failureError(failure);
      }

      await delay(this.delayMs, signal);
      this.assertNotAborted(signal);

      const isLast = index === chunks.length - 1;
      yield {
        text: chunk,
        ...(isLast ? { usage, finishReason: 'stop' } : {}),
      };
    }

    if (failure !== undefined && failure.afterChunks >= chunks.length) {
      throw this.failureError(failure);
    }
  }

  private matchingFailure(
    scope: 'outline' | 'section',
    sectionNumber: number | undefined,
  ): FakeAiFailure | undefined {
    const failure = this.failure;

    if (failure === undefined || failure.scope !== scope) {
      return undefined;
    }

    if (scope === 'section' && failure.sectionNumber !== sectionNumber) {
      return undefined;
    }

    return failure;
  }

  private failureError(failure: FakeAiFailure): AiProviderError {
    return new AiProviderError(
      failure.code ?? 'AI_UPSTREAM',
      failure.message ?? `The fake AI provider failed while generating ${failure.scope}.`,
      {
        retryable: false,
        details: {
          scope: failure.scope,
          ...(failure.sectionNumber === undefined ? {} : { sectionNumber: failure.sectionNumber }),
          afterChunks: failure.afterChunks,
        },
      },
    );
  }

  private assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new AiProviderError('AI_ABORTED', 'The AI request was cancelled.');
    }
  }
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const characters = Array.from(text);
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(''));
  }

  return chunks;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new AiProviderError('AI_ABORTED', 'The AI request was cancelled.'));
  }

  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(new AiProviderError('AI_ABORTED', 'The AI request was cancelled.'));
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
