import type { KeyStatus } from '@ccb/contracts';
import type { Logger } from 'pino';

import type {
  ResolvedSecret,
  SecretRemoveResult,
  SecretStore,
  SecretWriteResult,
} from '../../ports/secret-store.js';
import type { ConfigSecretStore } from './config-secret-store.js';
import type { KeychainSecretStore } from './keychain-secret-store.js';

export interface CompositeSecretStoreOptions {
  configStore: ConfigSecretStore;
  keychain: KeychainSecretStore;
  env?: NodeJS.ProcessEnv;
}

export class CompositeSecretStore implements SecretStore {
  private readonly env: NodeJS.ProcessEnv;
  private keychainFailed = false;

  constructor(
    private readonly options: CompositeSecretStoreOptions,
    private readonly logger: Logger,
  ) {
    this.env = options.env ?? process.env;
  }

  async resolve(): Promise<ResolvedSecret | null> {
    const environmentKey = this.environmentKey();

    if (environmentKey !== null) {
      return { key: environmentKey, source: 'environment' };
    }

    if (!this.keychainFailed) {
      try {
        const keychainKey = await this.options.keychain.get();

        if (keychainKey !== null && keychainKey.trim().length > 0) {
          return { key: keychainKey.trim(), source: 'keychain' };
        }
      } catch (error) {
        this.keychainFailed = true;
        this.logger.warn(
          { err: error },
          'The OS keychain is unavailable. Falling back to the local credentials file.',
        );
      }
    }

    const configKey = await this.options.configStore.get();

    if (configKey !== null && configKey.trim().length > 0) {
      return { key: configKey.trim(), source: 'config' };
    }

    return null;
  }

  async describe(): Promise<KeyStatus> {
    const resolved = await this.resolve();

    return resolved === null
      ? { configured: false, source: 'none' }
      : { configured: true, source: resolved.source };
  }

  async setKey(key: string): Promise<SecretWriteResult> {
    const trimmed = key.trim();

    if (trimmed.length === 0) {
      throw new Error('The API key cannot be empty.');
    }

    if (!this.keychainFailed) {
      try {
        await this.options.keychain.set(trimmed);
        await this.options.configStore.remove();
        return { source: 'keychain' };
      } catch (error) {
        this.keychainFailed = true;
        this.logger.warn(
          { err: error },
          'The OS keychain is unavailable. Using the fallback file.',
        );
      }
    }

    await this.options.configStore.set(trimmed);
    return {
      source: 'config',
      warning:
        'The OS keychain is unavailable. The key was stored in the local credentials file with owner-only permissions.',
    };
  }

  async removeKey(): Promise<SecretRemoveResult> {
    const environmentStillSet = this.environmentKey() !== null;
    let removed = false;
    let warning: string | undefined;

    try {
      removed = (await this.options.keychain.remove()) || removed;
    } catch (error) {
      warning = 'The OS keychain could not be updated. The fallback file was still cleared.';
      this.logger.warn(
        { err: error },
        'The OS keychain could not be updated while removing a key.',
      );
    }

    try {
      removed = (await this.options.configStore.remove()) || removed;
    } catch {
      warning = 'The local credential fallback file could not be removed.';
      this.logger.warn('The local credential fallback file could not be removed.');
    }

    return {
      removed,
      environmentStillSet,
      ...(warning === undefined ? {} : { warning }),
    };
  }

  private environmentKey(): string | null {
    const value = this.env['DEEPSEEK_API_KEY']?.trim();
    return value === undefined || value.length === 0 ? null : value;
  }
}
