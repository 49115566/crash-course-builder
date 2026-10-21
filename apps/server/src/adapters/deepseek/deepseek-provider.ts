import type { ErrorCode } from '@ccb/contracts';

import { AiProviderError } from '../../domain/ai-errors.js';
import type { AiChunk, AiProvider, OutlineInput, SectionInput } from '../../ports/ai-provider.js';
import { parseSseStream, type SseMessage } from './sse-parser.js';

export interface DeepSeekTimeouts {
  firstByteMs: number;
  idleMs: number;
  absoluteMs: number;
}

export const DEFAULT_DEEPSEEK_TIMEOUTS: DeepSeekTimeouts = {
  firstByteMs: 45_000,
  idleMs: 60_000,
  absoluteMs: 600_000,
};

export interface DeepSeekProviderOptions {
  baseUrl: string;
  model: string;
  getApiKey: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeouts?: Partial<DeepSeekTimeouts>;
}

interface DeepSeekStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

const STATUS_ERRORS: Record<number, { code: ErrorCode; message: string; retryable: boolean }> = {
  401: {
    code: 'AI_AUTH_INVALID',
    message: 'DeepSeek rejected the API key. Run npm run key:set to update it.',
    retryable: false,
  },
  402: {
    code: 'AI_INSUFFICIENT_BALANCE',
    message: 'The DeepSeek account has insufficient balance for this request.',
    retryable: false,
  },
  429: {
    code: 'AI_RATE_LIMITED',
    message: 'DeepSeek is rate limiting requests. Wait a moment, then resume manually.',
    retryable: true,
  },
};

export class DeepSeekProvider implements AiProvider {
  private readonly timeouts: DeepSeekTimeouts;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DeepSeekProviderOptions) {
    this.timeouts = { ...DEFAULT_DEEPSEEK_TIMEOUTS, ...options.timeouts };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  streamOutline(input: OutlineInput, signal: AbortSignal): AsyncIterable<AiChunk> {
    return this.stream(input.prompt, signal);
  }

  streamSection(input: SectionInput, signal: AbortSignal): AsyncIterable<AiChunk> {
    return this.stream(input.prompt, signal);
  }

  private async *stream(
    prompt: { system: string; user: string },
    signal: AbortSignal,
  ): AsyncIterable<AiChunk> {
    const key = await this.options.getApiKey();

    if (key === null || key.trim().length === 0) {
      throw new AiProviderError('KEY_MISSING', 'No DeepSeek API key is configured.');
    }

    const controller = new AbortController();
    let timedOut = false;
    let externalAborted = false;
    const onExternalAbort = (): void => {
      externalAborted = true;
      controller.abort();
    };
    signal.addEventListener('abort', onExternalAbort, { once: true });

    const absoluteTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeouts.absoluteMs);
    absoluteTimer.unref();

    try {
      if (signal.aborted) {
        externalAborted = true;
        controller.abort();
      }

      const response = await this.fetchImpl(
        `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            model: this.options.model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw this.httpError(response.status);
      }

      if (response.body === null) {
        throw new AiProviderError('AI_UPSTREAM', 'DeepSeek returned an empty response stream.');
      }

      const messages = parseSseStream(response.body);
      let firstChunk = true;

      while (true) {
        const result = await this.nextMessage(messages, controller, firstChunk, () => {
          timedOut = true;
        });

        if (result.done) {
          return;
        }

        const message = result.value;

        if (message.data.trim() === '[DONE]') {
          return;
        }

        let chunk: DeepSeekStreamChunk;

        try {
          chunk = JSON.parse(message.data) as DeepSeekStreamChunk;
        } catch {
          throw new AiProviderError(
            'AI_UPSTREAM',
            'DeepSeek returned a malformed streaming response.',
          );
        }

        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content ?? '';
        const usage = mapUsage(chunk.usage);
        const finishReason = choice?.finish_reason ?? undefined;

        if (text.length > 0 || usage !== undefined || finishReason !== undefined) {
          firstChunk = false;
          yield {
            text,
            ...(usage === undefined ? {} : { usage }),
            ...(finishReason === undefined ? {} : { finishReason }),
          };
        }
      }
    } catch (error) {
      if (timedOut) {
        throw new AiProviderError(
          'AI_TIMEOUT',
          'DeepSeek did not finish responding in time. Resume manually to try again.',
          { retryable: true, cause: error },
        );
      }

      if (externalAborted || signal.aborted) {
        throw new AiProviderError('AI_ABORTED', 'The AI request was cancelled.', { cause: error });
      }

      if (error instanceof AiProviderError) {
        throw error;
      }

      throw new AiProviderError(
        'AI_NETWORK',
        'DeepSeek could not be reached. Check your connection, then resume manually.',
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(absoluteTimer);
      signal.removeEventListener('abort', onExternalAbort);
    }
  }

  private async nextMessage(
    messages: AsyncGenerator<SseMessage>,
    controller: AbortController,
    firstChunk: boolean,
    onTimeout: () => void,
  ): Promise<IteratorResult<SseMessage>> {
    const timeoutMs = firstChunk ? this.timeouts.firstByteMs : this.timeouts.idleMs;
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        controller.abort();
        reject(new Error('AI stream timed out.'));
      }, timeoutMs);
      timer.unref();
    });

    const pending = messages.next();
    void pending.catch(() => undefined);

    try {
      return await Promise.race([pending, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private httpError(status: number): AiProviderError {
    const mapped = STATUS_ERRORS[status];

    if (mapped !== undefined) {
      return new AiProviderError(mapped.code, mapped.message, {
        retryable: mapped.retryable,
        details: { status },
      });
    }

    if (status >= 500) {
      return new AiProviderError(
        'AI_UPSTREAM',
        'DeepSeek reported a server error. Resume manually to try again.',
        { retryable: true, details: { status } },
      );
    }

    return new AiProviderError('AI_UPSTREAM', 'DeepSeek rejected the generation request.', {
      details: { status },
    });
  }
}

function mapUsage(usage: DeepSeekStreamChunk['usage']): AiChunk['usage'] | undefined {
  if (usage === undefined || usage === null) {
    return undefined;
  }

  return {
    ...(usage.prompt_tokens === undefined ? {} : { promptTokens: usage.prompt_tokens }),
    ...(usage.completion_tokens === undefined ? {} : { completionTokens: usage.completion_tokens }),
    ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
  };
}
