import type { AsyncEntry } from '@napi-rs/keyring';

export interface KeychainSecretStore {
  get(): Promise<string | null>;
  set(key: string): Promise<void>;
  remove(): Promise<boolean>;
}

const SERVICE_NAME = 'crash-course-builder';
const ACCOUNT_NAME = 'deepseek';

async function loadKeyring() {
  return import('@napi-rs/keyring');
}

type KeyringModule = Awaited<ReturnType<typeof loadKeyring>>;

export class NapiKeychainSecretStore implements KeychainSecretStore {
  private modulePromise: Promise<KeyringModule> | null = null;

  private async entry(): Promise<AsyncEntry> {
    this.modulePromise ??= loadKeyring();
    const module = await this.modulePromise;
    return new module.AsyncEntry(SERVICE_NAME, ACCOUNT_NAME);
  }

  async get(): Promise<string | null> {
    const entry = await this.entry();
    return entry.getPassword();
  }

  async set(key: string): Promise<void> {
    const entry = await this.entry();
    await entry.setPassword(key);
  }

  async remove(): Promise<boolean> {
    const entry = await this.entry();
    return entry.deletePassword();
  }
}
