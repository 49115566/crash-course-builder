import { lstat } from 'node:fs/promises';
import path from 'node:path';

import { LibraryError } from '../../domain/library-errors.js';

export interface PathStats {
  exists: boolean;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export async function lstatIfExists(targetPath: string): Promise<PathStats> {
  try {
    const stats = await lstat(targetPath);
    return {
      exists: true,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymbolicLink: stats.isSymbolicLink(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, isDirectory: false, isFile: false, isSymbolicLink: false };
    }
    throw error;
  }
}

export function resolveInside(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, target);

  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    if (relative === '') {
      return target;
    }
    throw new LibraryError('VALIDATION_FAILED', 'The requested path is outside the library.');
  }

  return target;
}

export function relativeLibraryPath(root: string, targetPath: string): string {
  return path.relative(path.resolve(root), targetPath).split(path.sep).join('/');
}
