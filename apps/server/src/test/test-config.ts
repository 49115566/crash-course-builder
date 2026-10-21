import type { Logger } from 'pino';

import type { AppConfig } from '../config.js';
import { createLogger } from '../logger.js';

export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    libraryRoot: '/tmp/ccb-test-library',
    dataDir: '/tmp/ccb-test-data',
    configDir: '/tmp/ccb-test-config',
    model: 'deepseek-chat',
    aiProvider: 'fake',
    deepseekBaseUrl: 'https://api.deepseek.com',
    logLevel: 'silent',
    webDistDir: '/tmp/ccb-test-no-web-build',
    fakeAi: { delayMs: 0, chunkSize: 24 },
    disableKeychain: false,
    ...overrides,
  };
}

export function makeSilentLogger(): Logger {
  return createLogger({ logLevel: 'silent' });
}
