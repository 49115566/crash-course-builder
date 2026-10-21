import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempDirectory } from '../../test/library-fixtures.js';
import { writeJsonAtomic } from './atomic.js';

describe('writeJsonAtomic', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDirectory('ccb-atomic-');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes private, pretty JSON with a trailing newline', async () => {
    const filePath = path.join(directory, 'metadata.json');

    await writeJsonAtomic(filePath, { hello: 'world' });

    const contents = await readFile(filePath, 'utf8');
    const fileStat = await stat(filePath);

    expect(JSON.parse(contents)).toEqual({ hello: 'world' });
    expect(contents.endsWith('\n')).toBe(true);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it('replaces existing content atomically and leaves no temporary files', async () => {
    const filePath = path.join(directory, 'metadata.json');
    await writeJsonAtomic(filePath, { version: 1 });
    await writeJsonAtomic(filePath, { version: 2 });

    const entries = await readdir(directory);

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ version: 2 });
    expect(entries).toEqual(['metadata.json']);
  });

  it('cleans up its temporary file when serialization fails', async () => {
    const filePath = path.join(directory, 'metadata.json');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    await expect(writeJsonAtomic(filePath, circular)).rejects.toBeTruthy();
    expect(await readdir(directory)).toEqual([]);
  });
});
