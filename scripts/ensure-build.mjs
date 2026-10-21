import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force') || process.env['CCB_FORCE_BUILD'] === '1';

const buildInputs = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'packages/contracts/src',
  'packages/contracts/package.json',
  'packages/contracts/tsconfig.json',
  'packages/contracts/tsconfig.build.json',
  'apps/server/src',
  'apps/server/package.json',
  'apps/server/tsconfig.json',
  'apps/server/tsconfig.build.json',
  'apps/web/src',
  'apps/web/public',
  'apps/web/package.json',
  'apps/web/angular.json',
  'apps/web/tsconfig.json',
  'apps/web/tsconfig.app.json',
];

const buildOutputs = [
  'packages/contracts/dist/index.js',
  'apps/server/dist/main.js',
  'apps/web/dist/web/browser/index.html',
];

function newestMtime(target) {
  const absolute = path.join(repoRoot, target);

  if (!existsSync(absolute)) {
    return 0;
  }

  const stats = statSync(absolute);

  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let newest = stats.mtimeMs;

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    newest = Math.max(newest, newestMtime(path.join(target, entry.name)));
  }

  return newest;
}

function oldestMtime(target) {
  const absolute = path.join(repoRoot, target);

  if (!existsSync(absolute)) {
    return Number.POSITIVE_INFINITY;
  }

  return statSync(absolute).mtimeMs;
}

function isStale() {
  for (const output of buildOutputs) {
    if (!existsSync(path.join(repoRoot, output))) {
      return true;
    }
  }

  const newestInput = Math.max(...buildInputs.map(newestMtime));
  const oldestOutput = Math.min(...buildOutputs.map(oldestMtime));

  return newestInput > oldestOutput;
}

if (!force && !isStale()) {
  process.stdout.write('Build artifacts are up to date.\n');
  process.exit(0);
}

process.stdout.write(
  force ? 'Building because a build was requested.\n' : 'Build artifacts are stale; building.\n',
);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error !== undefined) {
  process.stderr.write(`Could not run the build: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
