import type { HttpErrorResponse } from '@angular/common/http';
import type { ErrorCode } from '@ccb/contracts';

export interface ApiClientError {
  code: ErrorCode | 'NETWORK_ERROR';
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
  status: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toApiClientError(error: HttpErrorResponse): ApiClientError {
  const payload: unknown = error.error;

  if (isRecord(payload) && isRecord(payload['error'])) {
    const envelope = payload['error'];
    const code = envelope['code'];
    const message = envelope['message'];
    const retryable = envelope['retryable'];
    const details = envelope['details'];

    if (typeof code === 'string' && typeof message === 'string') {
      return {
        code: code as ErrorCode,
        message,
        retryable: retryable === true,
        details: isRecord(details) ? details : {},
        status: error.status,
      };
    }
  }

  if (error.status === 0) {
    return {
      code: 'NETWORK_ERROR',
      message: 'The local service could not be reached.',
      retryable: true,
      details: {},
      status: 0,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'The local service returned an unexpected response.',
    retryable: error.status >= 500,
    details: {},
    status: error.status,
  };
}
