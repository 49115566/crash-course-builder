import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveInside, relativeLibraryPath } from '../adapters/fs/fs-paths.js';
import { LibraryError } from './library-errors.js';
import { sanitizeFolderName, uniqueFolderName } from './library-naming.js';

const ROOT = path.resolve('/tmp/ccb-path-safety');

function isValidationError(error: unknown): boolean {
  return error instanceof LibraryError && error.code === 'VALIDATION_FAILED';
}

const REJECTED_NAMES = [
  '..',
  '../outside',
  '..\\outside',
  'nested/name',
  'nested\\name',
  'C:\\Windows',
  '\\\\server\\share',
  'CON',
  'con.txt',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'LPT9',
  'name\u0000suffix',
  '.',
  '...',
  '   ',
  '\u200b',
  '\u202e\u0000',
];

const FUZZ_SEEDS = ['..', '.', '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\u0000', '\n', '\t'];

function deterministicNames(count: number): string[] {
  const names: string[] = [];
  let seed = 0x5eed1234;

  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };

  for (let index = 0; index < count; index += 1) {
    let value = '';

    for (let character = 0; character < 12; character += 1) {
      const choice = next() % 4;

      if (choice === 0) {
        value += FUZZ_SEEDS[next() % FUZZ_SEEDS.length] ?? 'x';
      } else if (choice === 1) {
        value += String.fromCodePoint(0x20 + (next() % 0x5f));
      } else if (choice === 2) {
        value += String.fromCodePoint(0x100 + (next() % 0x200));
      } else {
        value += String.fromCodePoint(0x1f000 + (next() % 0x100));
      }
    }

    names.push(value);
  }

  return names;
}

describe('path safety fuzzing', () => {
  it('rejects traversal, separators, reserved names, and control characters', () => {
    for (const name of REJECTED_NAMES) {
      expect(() => sanitizeFolderName(name), JSON.stringify(name)).toThrowError();
    }
  });

  it('strips non-null control characters instead of rejecting safe text', () => {
    expect(sanitizeFolderName('name\u0001suffix')).toBe('namesuffix');
  });

  it('never produces a value containing a path separator or null byte', () => {
    for (const name of deterministicNames(750)) {
      try {
        const sanitized = sanitizeFolderName(name);
        expect(sanitized).not.toMatch(/[/\\]/);
        expect(sanitized.includes('\u0000')).toBe(false);
        expect(path.basename(sanitized)).toBe(sanitized);
      } catch (error) {
        expect(isValidationError(error), JSON.stringify(name)).toBe(true);
      }
    }
  });

  it('always keeps unique names inside the requested length budget', () => {
    const existing = Array.from({ length: 40 }, (_, index) => `Folder ${String(index)}`);

    for (const name of deterministicNames(250)) {
      try {
        const unique = uniqueFolderName(name, existing, 80);
        expect(Array.from(unique).length).toBeLessThanOrEqual(80);
        expect(existing).not.toContain(unique);
      } catch (error) {
        expect(isValidationError(error), JSON.stringify(name)).toBe(true);
      }
    }
  });

  it('normalizes Unicode before comparison and collision handling', () => {
    expect(sanitizeFolderName('  Ｆｕｌｌｗｉｄｔｈ　Nａｍｅ  ')).toBe('Fullwidth Name');
    expect(uniqueFolderName('café', ['cafe\u0301'])).toBe('café (2)');
  });

  it('resolves paths only inside the library root', () => {
    expect(resolveInside(ROOT, 'Computer Science', 'Vector Databases')).toBe(
      path.join(ROOT, 'Computer Science', 'Vector Databases'),
    );

    for (const target of ['..', '../outside', '/etc/passwd', 'folder/../../outside']) {
      expect(() => resolveInside(ROOT, target), target).toThrowError(LibraryError);
    }
  });

  it('formats relative paths with forward slashes', () => {
    expect(relativeLibraryPath(ROOT, path.join(ROOT, 'A', 'B'))).toBe('A/B');
  });
});
