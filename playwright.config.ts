import { defineConfig, devices } from '@playwright/test';
import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';

const baseURL = 'http://127.0.0.1:4310';

function server(
  name: string,
  port: number,
  options: { key: boolean; env?: Record<string, string> } = { key: true },
) {
  return {
    command: 'node e2e/start-server.mjs',
    url: `http://127.0.0.1:${String(port)}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CCB_E2E_NAME: name,
      CCB_E2E_PORT: String(port),
      CCB_E2E_WITH_KEY: options.key ? '1' : '0',
      ...options.env,
    },
  };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      [MUTATION_HEADER_NAME]: MUTATION_HEADER_VALUE,
    },
  },
  webServer: [
    server('main', 4310),
    server('wizard', 4311, {
      key: true,
      env: {
        CCB_FAKE_AI_DELAY_MS: '35',
        CCB_FAKE_AI_CHUNK_SIZE: '20',
      },
    }),
    server('failure', 4312, {
      key: true,
      env: {
        CCB_FAKE_AI_DELAY_MS: '12',
        CCB_FAKE_AI_CHUNK_SIZE: '24',
        CCB_FAKE_AI_FAIL_SCOPE: 'section',
        CCB_FAKE_AI_FAIL_SECTION: '3',
        CCB_FAKE_AI_FAIL_AFTER_CHUNKS: '1',
        CCB_FAKE_AI_FAIL_ONCE: 'true',
        CCB_FAKE_AI_FAIL_CODE: 'AI_TIMEOUT',
      },
    }),
    server('keyless', 4313, {
      key: false,
      env: { CCB_FAKE_AI_DELAY_MS: '0' },
    }),
    server('accessibility', 4314, {
      key: true,
      env: { CCB_FAKE_AI_DELAY_MS: '0' },
    }),
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
