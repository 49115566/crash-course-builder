import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempDirectory } from '../../test/library-fixtures.js';
import { makeSilentLogger } from '../../test/test-config.js';
import { CompositeSecretStore } from './composite-secret-store.js';
import { ConfigSecretStore } from './config-secret-store.js';
import type { KeychainSecretStore } from './keychain-secret-store.js';

class MemoryKeychain implements KeychainSecretStore {
  value: string | null = null;
  fail = false;

  async get(): Promise<string | null> {
    if (this.fail) throw new Error('keychain unavailable');
    return this.value;
  }

  async set(key: string): Promise<void> {
    if (this.fail) throw new Error('keychain unavailable');
    this.value = key;
  }

  async remove(): Promise<boolean> {
    if (this.fail) throw new Error('keychain unavailable');
    const existed = this.value !== null;
    this.value = null;
    return existed;
  }
}

describe('CompositeSecretStore', () => {
  let directory: string;
  let keychain: MemoryKeychain;

  beforeEach(async () => {
    directory = await createTempDirectory('ccb-secrets-');
    keychain = new MemoryKeychain();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function makeParts(env: NodeJS.ProcessEnv = {}): {
    store: CompositeSecretStore;
    configStore: ConfigSecretStore;
  } {
    const configStore = new ConfigSecretStore(directory, makeSilentLogger());
    return {
      store: new CompositeSecretStore({ configStore, keychain, env }, makeSilentLogger()),
      configStore,
    };
  }

  function makeStore(env: NodeJS.ProcessEnv = {}): CompositeSecretStore {
    return makeParts(env).store;
  }

  it('prefers the environment over the keychain and fallback file', async () => {
    keychain.value = 'keychain-key';
    const store = makeStore({ DEEPSEEK_API_KEY: ' env-key ' });

    await expect(store.resolve()).resolves.toEqual({
      key: 'env-key',
      source: 'environment',
    });
    await expect(store.describe()).resolves.toEqual({
      configured: true,
      source: 'environment',
    });
  });

  it('falls back to the keychain and stores new keys there', async () => {
    keychain.value = 'keychain-key';
    const store = makeStore();

    await expect(store.resolve()).resolves.toEqual({
      key: 'keychain-key',
      source: 'keychain',
    });

    await expect(store.setKey('new-key')).resolves.toEqual({ source: 'keychain' });
    expect(keychain.value).toBe('new-key');
  });

  it('stores keys in a private fallback file when the keychain is unavailable', async () => {
    keychain.fail = true;
    const store = makeStore();

    const result = await store.setKey('fallback-key');
    const file = path.join(directory, 'credentials.json');

    expect(result.source).toBe('config');
    expect(result.warning).toContain('keychain');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      schemaVersion: 1,
      deepseekApiKey: 'fallback-key',
    });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(store.resolve()).resolves.toEqual({
      key: 'fallback-key',
      source: 'config',
    });
  });

  it('reports missing keys and removes both fallback locations', async () => {
    keychain.value = 'keychain-key';
    const { store, configStore } = makeParts();
    await configStore.set('config-key');

    await expect(store.describe()).resolves.toEqual({
      configured: true,
      source: 'keychain',
    });

    const removed = await store.removeKey();
    expect(removed).toMatchObject({ removed: true, environmentStillSet: false });
    expect(keychain.value).toBeNull();
    await expect(stat(path.join(directory, 'credentials.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(store.describe()).resolves.toEqual({
      configured: false,
      source: 'none',
    });
  });

  it('does not claim removal when the environment still provides a key', async () => {
    const store = makeStore({ DEEPSEEK_API_KEY: 'env-key' });
    const removed = await store.removeKey();

    expect(removed.environmentStillSet).toBe(true);
    await expect(store.describe()).resolves.toMatchObject({ source: 'environment' });
  });
});
