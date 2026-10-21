import { SUBJECT_NAME_MAX_LENGTH } from '@ccb/contracts';

import { libraryValidationError } from './library-errors.js';

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const ILLEGAL_FOLDER_CHARACTERS = /[<>:"|?*]/g;

function assertNoPathSeparators(value: string): void {
  if (value.includes('/') || value.includes('\\') || value.includes('\u0000')) {
    throw libraryValidationError('Names cannot contain path separators or null characters.');
  }
}

function stripControlCharacters(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '');
}

function truncate(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length <= maxLength ? value : characters.slice(0, maxLength).join('');
}

export function normalizeNameForComparison(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

export function sanitizeFolderName(value: string, maxLength = SUBJECT_NAME_MAX_LENGTH): string {
  assertNoPathSeparators(value);

  let sanitized = stripControlCharacters(value.normalize('NFKC'))
    .replace(ILLEGAL_FOLDER_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');

  sanitized = truncate(sanitized, maxLength).trim();

  if (sanitized.length === 0) {
    throw libraryValidationError('Use at least one visible character for the folder name.');
  }

  if (WINDOWS_RESERVED_NAME.test(sanitized)) {
    throw libraryValidationError(
      `"${sanitized}" is a reserved name on Windows. Choose a different name.`,
    );
  }

  return sanitized;
}

function nameWithSuffix(base: string, attempt: number, maxLength: number): string {
  if (attempt === 1) {
    return truncate(base, maxLength).trim();
  }

  const suffix = ` (${String(attempt)})`;
  const baseLength = Math.max(1, maxLength - suffix.length);
  return `${truncate(base, baseLength).trimEnd()}${suffix}`;
}

export function uniqueFolderName(
  requestedName: string,
  existingNames: Iterable<string>,
  maxLength = SUBJECT_NAME_MAX_LENGTH,
  excludeName?: string,
): string {
  const base = sanitizeFolderName(requestedName, maxLength);
  const existing = new Set<string>();
  const excluded = excludeName === undefined ? null : normalizeNameForComparison(excludeName);

  for (const name of existingNames) {
    if (excluded !== null && normalizeNameForComparison(name) === excluded) {
      continue;
    }
    existing.add(normalizeNameForComparison(name));
  }

  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const candidate = nameWithSuffix(base, attempt, maxLength);
    if (!existing.has(normalizeNameForComparison(candidate))) {
      return candidate;
    }
  }

  throw libraryValidationError('Too many folders share this name. Choose a more specific name.');
}
