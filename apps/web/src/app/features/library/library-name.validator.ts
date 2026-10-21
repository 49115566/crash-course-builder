import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function libraryNameError(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return 'Enter a name.';
  }

  if (trimmed.length > 80) {
    return 'Use 80 characters or fewer.';
  }

  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\u0000')) {
    return 'Names cannot contain slashes or null characters.';
  }

  if (trimmed === '.' || trimmed === '..') {
    return 'Choose a visible name.';
  }

  if (WINDOWS_RESERVED_NAME.test(trimmed)) {
    return 'This name is reserved by Windows. Choose another.';
  }

  if (trimmed.replace(/^[.\s]+|[.\s]+$/g, '').length === 0) {
    return 'Use at least one visible character.';
  }

  return null;
}

export const libraryNameValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value: unknown = control.value;
  if (typeof value !== 'string') {
    return { libraryName: 'Enter a name.' };
  }

  const error = libraryNameError(value);
  return error === null ? null : { libraryName: error };
};
