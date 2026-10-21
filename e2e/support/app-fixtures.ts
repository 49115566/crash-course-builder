import { test as base, type Locator } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppMode = 'fast' | 'streaming' | 'failure' | 'keyless';

export interface RunningApp {
  baseURL: string;
  root: string;
}

interface TestFixtures {
  baseURL: string;
}

interface WorkerFixtures {
  appMode: AppMode;
  appKey: string;
  app: RunningApp;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const OUTPUT_LIMIT = 8_000;

const MODE_ENV: Record<AppMode, Record<string, string>> = {
  fast: {
    CCB_FAKE_AI_DELAY_MS: '0',
    CCB_FAKE_AI_CHUNK_SIZE: '1000',
  },
  streaming: {
    CCB_FAKE_AI_DELAY_MS: '35',
    CCB_FAKE_AI_CHUNK_SIZE: '20',
  },
  failure: {
    CCB_FAKE_AI_DELAY_MS: '0',
    CCB_FAKE_AI_CHUNK_SIZE: '1000',
    CCB_FAKE_AI_FAIL_SCOPE: 'section',
    CCB_FAKE_AI_FAIL_SECTION: '3',
    CCB_FAKE_AI_FAIL_AFTER_CHUNKS: '1',
    CCB_FAKE_AI_FAIL_ONCE: 'true',
    CCB_FAKE_AI_FAIL_CODE: 'AI_TIMEOUT',
  },
  keyless: {
    CCB_FAKE_AI_DELAY_MS: '0',
    CCB_FAKE_AI_CHUNK_SIZE: '1000',
  },
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  appMode: ['fast', { option: true, scope: 'worker' }],
  appKey: ['default', { option: true, scope: 'worker' }],
  app: [
    async ({ appMode, appKey }, use, workerInfo) => {
      const name = `${appKey}-${workerInfo.project.name}`;
      const running = await startApp(name, appMode);
      process.env['CCB_E2E_ROOT'] = running.root;

      try {
        await use(running);
      } finally {
        await stopApp(running.child);
      }
    },
    { scope: 'worker', timeout: START_TIMEOUT_MS + STOP_TIMEOUT_MS },
  ],
  baseURL: async ({ app }, use) => {
    await use(app.baseURL);
  },
});

export { expect } from '@playwright/test';

export async function activate(locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'attached' });
  await locator.dispatchEvent('click');
}

interface StartedApp extends RunningApp {
  child: ChildProcess;
}

async function startApp(name: string, mode: AppMode): Promise<StartedApp> {
  const port = await findFreePort();
  const baseURL = `http://127.0.0.1:${String(port)}`;
  const root = path.join(repoRoot, '.tmp', 'e2e', name);
  const output = { text: '' };
  const child = spawn(process.execPath, ['e2e/start-server.mjs'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...MODE_ENV[mode],
      CCB_E2E_NAME: name,
      CCB_E2E_PORT: String(port),
      CCB_E2E_WITH_KEY: mode === 'keyless' ? '0' : '1',
    },
  });

  captureOutput(child, output);

  try {
    await waitForHealthy(baseURL, child, output);
  } catch (error) {
    await stopApp(child);
    throw error;
  }

  return { child, baseURL, root };
}

function captureOutput(child: ChildProcess, output: { text: string }): void {
  const append = (chunk: Buffer): void => {
    output.text = `${output.text}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT);
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
}

async function waitForHealthy(
  baseURL: string,
  child: ChildProcess,
  output: { text: string },
): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The E2E server exited before it was healthy.\n${output.text}`);
    }

    try {
      const response = await fetch(`${baseURL}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for the E2E server at ${baseURL}.\n${output.text}`);
}

async function stopApp(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  const exited = new Promise<boolean>((resolve) => {
    child.once('exit', () => resolve(true));
  });

  if (child.exitCode !== null) {
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS);
    timer.unref();
  });

  child.kill('SIGTERM');

  const result = await Promise.race([exited, timedOut]);
  clearTimeout(timer);

  if (!result) {
    child.kill('SIGKILL');
    await exited;
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a port for the E2E server.'));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}
