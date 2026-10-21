import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runDoctor } from './doctor-check.js';

const ENV_KEYS = [
  'CCB_LIBRARY_ROOT',
  'CCB_DATA_DIR',
  'CCB_CONFIG_DIR',
  'CCB_WEB_DIST',
  'CCB_PORT',
  'CCB_DISABLE_KEYCHAIN',
  'DEEPSEEK_API_KEY',
] as const;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('No free port.'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

describe('runDoctor', () => {
  const original = new Map<string, string | undefined>();
  const directories: string[] = [];

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const value = original.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    original.clear();
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('reports build, permission, library, and key readiness without network validation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ccb-doctor-'));
    directories.push(root);
    const library = path.join(root, 'library');
    const data = path.join(root, 'data');
    const config = path.join(root, 'config');
    const web = path.join(root, 'web');
    await mkdir(library, { recursive: true });
    await mkdir(web, { recursive: true });
    await writeFile(path.join(web, 'index.html'), '<ccb-root></ccb-root>', 'utf8');

    for (const key of ENV_KEYS) original.set(key, process.env[key]);
    process.env['CCB_LIBRARY_ROOT'] = library;
    process.env['CCB_DATA_DIR'] = data;
    process.env['CCB_CONFIG_DIR'] = config;
    process.env['CCB_WEB_DIST'] = web;
    process.env['CCB_PORT'] = String(await freePort());
    process.env['CCB_DISABLE_KEYCHAIN'] = 'true';
    process.env['DEEPSEEK_API_KEY'] = 'doctor-test-key';

    const result = await runDoctor({ validateKey: false });
    const names = result.checks.map((check) => check.name);

    expect(result.ok).toBe(true);
    expect(names).toContain('Web build');
    expect(names).toContain('Library permissions');
    expect(names).toContain('Data permissions');
    expect(names).toContain('Library scan');
    expect(names).toContain('DeepSeek key');
  });
});
