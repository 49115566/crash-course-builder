import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { browserCommand, parseStartOptions, shouldOpenBrowser, verifyWebBuild } from './startup.js';

describe('production startup helpers', () => {
  it('parses production start flags', () => {
    expect(parseStartOptions([])).toEqual({ requireWebBuild: false, openBrowser: false });
    expect(parseStartOptions(['--open'])).toEqual({ requireWebBuild: false, openBrowser: true });
    expect(parseStartOptions(['--require-web-build', '--open'])).toEqual({
      requireWebBuild: true,
      openBrowser: true,
    });
    expect(parseStartOptions(['--open', '--no-open'])).toEqual({
      requireWebBuild: false,
      openBrowser: false,
    });
  });

  it('suppresses browser launch in CI, tests, and with the explicit opt-out', () => {
    expect(shouldOpenBrowser(true, {})).toBe(true);
    expect(shouldOpenBrowser(false, {})).toBe(false);
    expect(shouldOpenBrowser(true, { CI: '1' })).toBe(false);
    expect(shouldOpenBrowser(true, { CI: 'true' })).toBe(false);
    expect(shouldOpenBrowser(true, { CCB_NO_OPEN: '1' })).toBe(false);
    expect(shouldOpenBrowser(true, { NODE_ENV: 'test' })).toBe(false);
  });

  it('uses a platform-appropriate browser command', () => {
    expect(browserCommand('http://127.0.0.1:4310', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['http://127.0.0.1:4310'],
    });
    expect(browserCommand('http://127.0.0.1:4310', 'darwin')).toEqual({
      command: 'open',
      args: ['http://127.0.0.1:4310'],
    });
    expect(browserCommand('http://127.0.0.1:4310', 'win32')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', 'http://127.0.0.1:4310'],
    });
  });

  it('verifies the production web build exists', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ccb-build-check-'));

    try {
      expect(verifyWebBuild(directory).ok).toBe(false);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'index.html'), '<ccb-root></ccb-root>', 'utf8');
      expect(verifyWebBuild(directory)).toMatchObject({ ok: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
