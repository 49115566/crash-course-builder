import { describe, expect, it } from 'vitest';

import { LibraryError } from './library-errors.js';
import {
  normalizeNameForComparison,
  sanitizeFolderName,
  uniqueFolderName,
} from './library-naming.js';

describe('sanitizeFolderName', () => {
  it('normalizes unicode, whitespace, and illegal characters', () => {
    expect(sanitizeFolderName('  Cafe\u0301:  Science  ')).toBe('Café Science');
    expect(sanitizeFolderName('A < B > C')).toBe('A B C');
  });

  it('trims leading dots so folders stay visible', () => {
    expect(sanitizeFolderName('...Hidden...')).toBe('Hidden');
  });

  it('rejects path traversal and separators', () => {
    for (const value of ['../escape', 'a/b', 'a\\b', '..', '.', 'a\u0000b']) {
      expect(() => sanitizeFolderName(value)).toThrow(LibraryError);
    }
  });

  it('rejects Windows reserved names', () => {
    for (const value of ['CON', 'con', 'LPT1', 'com9.txt']) {
      expect(() => sanitizeFolderName(value)).toThrow(LibraryError);
    }
  });

  it('rejects names with no visible characters', () => {
    expect(() => sanitizeFolderName('...')).toThrow(LibraryError);
  });

  it('truncates long names', () => {
    expect(Array.from(sanitizeFolderName('a'.repeat(100))).length).toBe(80);
  });
});

describe('uniqueFolderName', () => {
  it('adds collision suffixes case-insensitively', () => {
    const name = uniqueFolderName('Math', ['math', 'MATH (2)']);

    expect(name).toBe('Math (3)');
  });

  it('excludes the current name during rename', () => {
    const name = uniqueFolderName('Math', ['Math'], 80, 'Math');

    expect(name).toBe('Math');
  });

  it('keeps suffixed names within the length limit', () => {
    const name = uniqueFolderName('a'.repeat(80), ['a'.repeat(80)]);

    expect(Array.from(name).length).toBeLessThanOrEqual(80);
    expect(name.endsWith(' (2)')).toBe(true);
  });
});

describe('normalizeNameForComparison', () => {
  it('handles unicode and case normalization', () => {
    expect(normalizeNameForComparison('Cafe\u0301')).toBe(normalizeNameForComparison('CAFÉ'));
  });
});
