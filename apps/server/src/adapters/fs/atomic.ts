import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const TEMP_PREFIX = '.ccb-tmp-';
const DIRECTORY_SYNC_ERRORS = new Set(['EINVAL', 'ENOTSUP', 'EPERM', 'EACCES', 'EISDIR']);

export async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined || !DIRECTORY_SYNC_ERRORS.has(code)) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `${TEMP_PREFIX}${path.basename(filePath)}-${randomUUID()}`);

  let handle: Awaited<ReturnType<typeof open>> | null = null;

  try {
    handle = await open(tempPath, 'wx', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextFileAtomic(filePath: string, contents: string): Promise<void> {
  await writeFileAtomic(filePath, contents);
}

export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true, maxRetries: 2 });
}
