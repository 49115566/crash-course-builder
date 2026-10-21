import { readFile } from 'node:fs/promises';

import type { z } from 'zod';

import { lstatIfExists } from './fs-paths.js';

export type MetadataReadResult<T> =
  | { state: 'ok'; value: T }
  | { state: 'missing' }
  | { state: 'invalid'; reason: 'unreadable' | 'malformed' | 'schema' };

export async function readJsonMetadata<T>(
  filePath: string,
  schema: z.ZodType<T>,
): Promise<MetadataReadResult<T>> {
  const stats = await lstatIfExists(filePath);

  if (!stats.exists) {
    return { state: 'missing' };
  }

  if (!stats.isFile || stats.isSymbolicLink) {
    return { state: 'invalid', reason: 'unreadable' };
  }

  let contents: string;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch {
    return { state: 'invalid', reason: 'unreadable' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { state: 'invalid', reason: 'malformed' };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { state: 'invalid', reason: 'schema' };
  }

  return { state: 'ok', value: result.data };
}
