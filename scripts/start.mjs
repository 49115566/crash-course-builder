import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(repoRoot, 'apps', 'server', 'dist', 'main.js');
const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');

if (!existsSync(serverEntry)) {
  process.stderr.write(
    `The server build was not found at ${serverEntry}. Run "npm run build" before "npm start".\n`,
  );
  process.exit(1);
}

const serverArgs = [serverEntry, '--require-web-build'];

if (!noOpen) {
  serverArgs.push('--open');
}

const child = spawn(process.execPath, serverArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

const forward = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => {
  forward('SIGINT');
});
process.on('SIGTERM', () => {
  forward('SIGTERM');
});

child.on('error', (error) => {
  process.stderr.write(`Crash Course Builder could not start: ${error.message}\n`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
