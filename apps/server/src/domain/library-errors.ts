import type { ErrorCode } from '@ccb/contracts';

export class LibraryError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'LibraryError';
    this.code = code;
    this.details = details;
  }
}

export function libraryValidationError(message: string, field = 'name'): LibraryError {
  return new LibraryError('VALIDATION_FAILED', message, { field });
}

export function libraryNotFoundError(message: string): LibraryError {
  return new LibraryError('NOT_FOUND', message);
}

export function libraryConflictError(
  message: string,
  details: Record<string, unknown> = {},
): LibraryError {
  return new LibraryError('CONFLICT', message, details);
}
