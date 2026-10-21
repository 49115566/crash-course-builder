import type { Logger } from 'pino';

import type { AppConfig } from '../../config.js';
import type { SecretStore } from '../../ports/secret-store.js';
import { CompositeSecretStore } from './composite-secret-store.js';
import { ConfigSecretStore } from './config-secret-store.js';
import { NapiKeychainSecretStore } from './keychain-secret-store.js';

export function createSecretStore(
  config: Pick<AppConfig, 'configDir'>,
  logger: Logger,
  env: NodeJS.ProcessEnv = process.env,
): SecretStore {
  return new CompositeSecretStore(
    {
      configStore: new ConfigSecretStore(config.configDir, logger),
      keychain: new NapiKeychainSecretStore(),
      env,
    },
    logger,
  );
}
