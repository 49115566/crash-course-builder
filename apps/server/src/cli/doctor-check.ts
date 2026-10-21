import { access, mkdir, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

import { FsLibraryRepository } from '../adapters/fs/fs-library-repository.js';
import { createSecretStore } from '../adapters/secrets/create-secret-store.js';
import { assertSupportedNode, loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { verifyWebBuild } from './startup.js';
import { validateDeepSeekKey } from './key-validation.js';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

async function writableDirectory(name: string, directory: string): Promise<DoctorCheck> {
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await access(directory);
    return { name, ok: true, detail: directory };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : `${directory} is not writable.`,
    };
  }
}

async function directoryPrivacy(name: string, directory: string): Promise<DoctorCheck> {
  if (process.platform === 'win32') {
    return { name, ok: true, detail: 'POSIX permissions are not used on Windows.' };
  }

  try {
    const stats = await stat(directory);
    const mode = stats.mode & 0o777;
    const isPrivate = (mode & 0o077) === 0;
    return {
      name,
      ok: true,
      detail: isPrivate
        ? `private (${mode.toString(8).padStart(3, '0')})`
        : `permissions ${mode.toString(8).padStart(3, '0')}; consider chmod 700 ${directory}`,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : `${directory} could not be inspected.`,
    };
  }
}

async function portAvailable(port: number): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve({
        name: 'Port',
        ok: false,
        detail:
          error.code === 'EADDRINUSE'
            ? `Port ${String(port)} is already in use.`
            : `Port ${String(port)} could not be checked: ${error.message}`,
      });
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        resolve({ name: 'Port', ok: true, detail: `127.0.0.1:${String(port)} is available.` });
      });
    });
  });
}

export async function runDoctor(options: { validateKey?: boolean } = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  try {
    assertSupportedNode();
    checks.push({ name: 'Node.js', ok: true, detail: process.versions.node });
  } catch (error) {
    checks.push({
      name: 'Node.js',
      ok: false,
      detail: error instanceof Error ? error.message : 'Unsupported Node.js version.',
    });
    return { ok: false, checks };
  }

  const config = loadConfig();
  const logger = createLogger({ logLevel: 'silent' });

  checks.push(await writableDirectory('Library', config.libraryRoot));
  checks.push(await writableDirectory('Data directory', config.dataDir));
  checks.push(await writableDirectory('Sessions directory', path.join(config.dataDir, 'sessions')));
  checks.push(await writableDirectory('Config directory', config.configDir));
  checks.push(await directoryPrivacy('Library permissions', config.libraryRoot));
  checks.push(await directoryPrivacy('Data permissions', config.dataDir));
  checks.push(await directoryPrivacy('Config permissions', config.configDir));
  checks.push(await portAvailable(config.port));

  const build = verifyWebBuild(config.webDistDir);
  checks.push({
    name: 'Web build',
    ok: build.ok,
    detail: build.ok ? config.webDistDir : `${build.message}`,
  });

  try {
    const repository = new FsLibraryRepository({ root: config.libraryRoot });
    await repository.initialize();
    const snapshot = await repository.scan();
    checks.push({
      name: 'Library scan',
      ok: true,
      detail: `${String(snapshot.subjects.length)} subjects, ${String(snapshot.totalCourses)} courses.`,
    });
  } catch (error) {
    checks.push({
      name: 'Library scan',
      ok: false,
      detail: error instanceof Error ? error.message : 'The library could not be read.',
    });
  }

  const secretStore = createSecretStore(config, logger);
  const keyStatus = await secretStore.describe();

  if (!keyStatus.configured) {
    checks.push({
      name: 'DeepSeek key',
      ok: false,
      detail: 'No key configured. Run npm run key:set.',
    });
  } else {
    const resolved = await secretStore.resolve();

    if (options.validateKey === false || resolved === null) {
      checks.push({
        name: 'DeepSeek key',
        ok: true,
        detail: `Configured via ${keyStatus.source}.`,
      });
    } else {
      const validation = await validateDeepSeekKey({
        baseUrl: config.deepseekBaseUrl,
        key: resolved.key,
      });
      checks.push({
        name: 'DeepSeek key',
        ok: validation.valid,
        detail: `${validation.message} Source: ${keyStatus.source}.`,
      });
    }
  }

  return { ok: checks.every((check) => check.ok), checks };
}
