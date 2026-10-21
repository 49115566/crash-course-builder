import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, assertSupportedNode, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    const config = loadConfig({ env: {}, homeDir: '/home/tester', cwd: '/work' });

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(4310);
    expect(config.libraryRoot).toBe(path.resolve('/home/tester/CrashCourses'));
    expect(config.model).toBe('deepseek-chat');
    expect(config.aiProvider).toBe('deepseek');
    expect(config.deepseekBaseUrl).toBe('https://api.deepseek.com');
    expect(config.logLevel).toBe('info');
    expect(config.dataDir).toContain('crash-course-builder');
    expect(config.configDir).toContain('crash-course-builder');
    expect(config.fakeAi).toEqual({ delayMs: 0, chunkSize: 24 });
    expect(config.disableKeychain).toBe(false);
  });

  it('parses fake AI test controls', () => {
    const config = loadConfig({
      env: {
        CCB_AI_PROVIDER: 'fake',
        CCB_FAKE_AI_DELAY_MS: '12',
        CCB_FAKE_AI_CHUNK_SIZE: '8',
        CCB_FAKE_AI_FAIL_SCOPE: 'section',
        CCB_FAKE_AI_FAIL_SECTION: '3',
        CCB_FAKE_AI_FAIL_AFTER_CHUNKS: '2',
        CCB_FAKE_AI_FAIL_ONCE: 'true',
        CCB_FAKE_AI_FAIL_CODE: 'AI_TIMEOUT',
      },
      homeDir: '/home/tester',
      cwd: '/work',
    });

    expect(config.fakeAi).toEqual({
      delayMs: 12,
      chunkSize: 8,
      failure: {
        scope: 'section',
        sectionNumber: 3,
        afterChunks: 2,
        code: 'AI_TIMEOUT',
      },
      failureOnce: true,
    });
  });

  it('allows tests to disable the OS keychain', () => {
    const config = loadConfig({
      env: { CCB_DISABLE_KEYCHAIN: 'true' },
      homeDir: '/home/tester',
      cwd: '/work',
    });

    expect(config.disableKeychain).toBe(true);
  });

  it('rejects invalid fake AI controls', () => {
    expect(() =>
      loadConfig({
        env: { CCB_FAKE_AI_FAIL_SCOPE: 'everything' },
        homeDir: '/home/tester',
        cwd: '/work',
      }),
    ).toThrow(ConfigError);

    expect(() =>
      loadConfig({
        env: { CCB_FAKE_AI_DELAY_MS: '-1' },
        homeDir: '/home/tester',
        cwd: '/work',
      }),
    ).toThrow(ConfigError);
  });

  it('accepts overrides and strips trailing slashes from the base URL', () => {
    const config = loadConfig({
      env: {
        NODE_ENV: 'production',
        CCB_PORT: '5000',
        CCB_LIBRARY_ROOT: '~/Courses',
        CCB_DATA_DIR: '/var/lib/ccb',
        CCB_CONFIG_DIR: '/etc/ccb',
        CCB_MODEL: 'deepseek-reasoner',
        CCB_AI_PROVIDER: 'fake',
        CCB_DEEPSEEK_BASE_URL: 'https://example.test/v1/',
        CCB_LOG_LEVEL: 'debug',
        CCB_WEB_DIST: '/srv/ccb/web',
      },
      homeDir: '/home/tester',
      cwd: '/work',
    });

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(5000);
    expect(config.libraryRoot).toBe(path.resolve('/home/tester/Courses'));
    expect(config.dataDir).toBe(path.resolve('/var/lib/ccb'));
    expect(config.configDir).toBe(path.resolve('/etc/ccb'));
    expect(config.model).toBe('deepseek-reasoner');
    expect(config.aiProvider).toBe('fake');
    expect(config.deepseekBaseUrl).toBe('https://example.test/v1');
    expect(config.logLevel).toBe('debug');
    expect(config.webDistDir).toBe(path.resolve('/srv/ccb/web'));
  });

  it('resolves relative paths against the working directory', () => {
    const config = loadConfig({
      env: { CCB_LIBRARY_ROOT: './library' },
      homeDir: '/home/tester',
      cwd: '/work',
    });

    expect(config.libraryRoot).toBe(path.resolve('/work/library'));
  });

  it('rejects invalid ports', () => {
    expect(() =>
      loadConfig({ env: { CCB_PORT: '70000' }, homeDir: '/home/tester', cwd: '/work' }),
    ).toThrow(ConfigError);
  });

  it('rejects invalid base URLs', () => {
    expect(() =>
      loadConfig({
        env: { CCB_DEEPSEEK_BASE_URL: 'not-a-url' },
        homeDir: '/home/tester',
        cwd: '/work',
      }),
    ).toThrow(ConfigError);
  });

  it('rejects invalid AI providers', () => {
    expect(() =>
      loadConfig({ env: { CCB_AI_PROVIDER: 'other' }, homeDir: '/home/tester', cwd: '/work' }),
    ).toThrow(ConfigError);
  });

  it('rejects invalid log levels', () => {
    expect(() =>
      loadConfig({ env: { CCB_LOG_LEVEL: 'loud' }, homeDir: '/home/tester', cwd: '/work' }),
    ).toThrow(ConfigError);
  });
});

describe('assertSupportedNode', () => {
  it('accepts supported Node versions', () => {
    expect(() => assertSupportedNode('24.15.0')).not.toThrow();
    expect(() => assertSupportedNode('24.18.0')).not.toThrow();
    expect(() => assertSupportedNode('26.0.0')).not.toThrow();
  });

  it('rejects unsupported Node versions', () => {
    expect(() => assertSupportedNode('24.14.9')).toThrow(ConfigError);
    expect(() => assertSupportedNode('25.0.0')).toThrow(ConfigError);
    expect(() => assertSupportedNode('22.22.3')).toThrow(ConfigError);
    expect(() => assertSupportedNode('not-a-version')).toThrow(ConfigError);
  });
});
