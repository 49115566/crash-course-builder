import type { Logger } from 'pino';

import type { AppConfig } from '../../config.js';
import type { AiProvider } from '../../ports/ai-provider.js';
import type { SecretStore } from '../../ports/secret-store.js';
import { DeepSeekProvider } from '../deepseek/deepseek-provider.js';
import { FakeAiProvider } from '../fake-ai/fake-ai-provider.js';

export function createAiProvider(
  config: Pick<AppConfig, 'aiProvider' | 'deepseekBaseUrl' | 'model' | 'fakeAi'>,
  secrets: SecretStore,
  logger: Logger,
): AiProvider {
  if (config.aiProvider === 'fake') {
    logger.warn('Using the deterministic fake AI provider. No network requests will be made.');
    return new FakeAiProvider({
      delayMs: config.fakeAi.delayMs,
      chunkSize: config.fakeAi.chunkSize,
      ...(config.fakeAi.failure === undefined
        ? {}
        : { failure: config.fakeAi.failure, failureOnce: config.fakeAi.failureOnce }),
    });
  }

  return new DeepSeekProvider({
    baseUrl: config.deepseekBaseUrl,
    model: config.model,
    getApiKey: async () => (await secrets.resolve())?.key ?? null,
  });
}
