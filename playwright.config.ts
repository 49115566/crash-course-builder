import { defineConfig, devices } from '@playwright/test';
import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';

function workerCount(): number {
  const configured = process.env['CCB_E2E_WORKERS'];

  if (configured !== undefined) {
    const parsed = Number(configured);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return process.env['CI'] ? 2 : 4;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: workerCount(),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      [MUTATION_HEADER_NAME]: MUTATION_HEADER_VALUE,
    },
  },
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
