import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.env['CCB_E2E_NAME'] ?? 'main';
const port = process.env['CCB_E2E_PORT'] ?? '4310';
const withKey = process.env['CCB_E2E_WITH_KEY'] !== '0';
const e2eRoot = path.join(repoRoot, '.tmp', 'e2e', name);
const libraryRoot = path.join(e2eRoot, 'library');
const dataDir = path.join(e2eRoot, 'data');
const configDir = path.join(e2eRoot, 'config');
const serverEntry = path.join(repoRoot, 'apps', 'server', 'dist', 'main.js');

if (!existsSync(serverEntry)) {
  console.error(`Server build not found at ${serverEntry}. Run npm run build first.`);
  process.exit(1);
}

rmSync(e2eRoot, { recursive: true, force: true });
mkdirSync(libraryRoot, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(configDir, { recursive: true });

const child = spawn(process.execPath, [serverEntry], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    CCB_PORT: port,
    CCB_LIBRARY_ROOT: libraryRoot,
    CCB_DATA_DIR: dataDir,
    CCB_CONFIG_DIR: configDir,
    CCB_LOG_LEVEL: 'warn',
    CCB_AI_PROVIDER: 'fake',
    CCB_DISABLE_KEYCHAIN: 'true',
    ...(withKey ? { DEEPSEEK_API_KEY: 'e2e-local-test-key' } : { DEEPSEEK_API_KEY: '' }),
  },
});

const stop = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
