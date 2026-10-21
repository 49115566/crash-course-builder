import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import type { ApiError, ErrorCode } from '@ccb/contracts';

import { AiProviderError } from '../domain/ai-errors.js';
import { LibraryError } from '../domain/library-errors.js';
import { OutlineError } from '../domain/outline-errors.js';
import { SessionError } from '../domain/session-errors.js';
import { getRequestId } from './response.js';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  EXPANSION_STARTED: 409,
  GENERATION_BUSY: 409,
  LIBRARY_UNAVAILABLE: 503,
  LIBRARY_SCAN_FAILED: 500,
  KEY_MISSING: 409,
  AI_AUTH_INVALID: 502,
  AI_INSUFFICIENT_BALANCE: 502,
  AI_RATE_LIMITED: 429,
  AI_TIMEOUT: 504,
  AI_ABORTED: 409,
  AI_NETWORK: 502,
  AI_UPSTREAM: 502,
  OUTLINE_INVALID: 422,
  INTERNAL_ERROR: 500,
};

const RETRYABLE_CODES = new Set<ErrorCode>([
  'LIBRARY_UNAVAILABLE',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_NETWORK',
  'AI_UPSTREAM',
]);

export interface AppErrorOptions {
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    this.details = options.details ?? {};
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = 'The requested resource could not be found.',
    details: Record<string, unknown> = {},
  ) {
    super('NOT_FOUND', message, { details });
    this.name = 'NotFoundError';
  }
}

export interface ErrorEnvelopeResult {
  status: number;
  body: ApiError;
}

interface BodyParserError {
  type?: string;
  status?: number;
}

function bodyParserStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const parserError = error as BodyParserError;
  if (!parserError.type?.startsWith('entity.')) {
    return null;
  }

  const status = parserError.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

function bodyParserMessage(type: string): string {
  if (type === 'entity.too.large') {
    return 'The request body is too large.';
  }

  if (type === 'entity.parse.failed') {
    return 'The request body contains malformed JSON.';
  }

  return 'The request body could not be processed.';
}

function validationEnvelope(error: ZodError): ErrorEnvelopeResult {
  return {
    status: STATUS_BY_CODE.VALIDATION_FAILED,
    body: {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request did not pass validation.',
        retryable: false,
        details: {
          issues: error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    },
  };
}

export function toErrorEnvelope(error: unknown): ErrorEnvelopeResult {
  if (error instanceof OutlineError) {
    return toErrorEnvelope(
      new AppError('OUTLINE_INVALID', error.message, {
        details: { issues: error.issues },
        cause: error,
      }),
    );
  }

  if (error instanceof LibraryError || error instanceof SessionError) {
    return toErrorEnvelope(
      new AppError(error.code, error.message, {
        details: error.details,
        cause: error,
      }),
    );
  }

  if (error instanceof AiProviderError) {
    return toErrorEnvelope(
      new AppError(error.code, error.message, {
        retryable: error.retryable,
        details: error.details,
        cause: error,
      }),
    );
  }

  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          details: error.details,
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return validationEnvelope(error);
  }

  const parserStatus = bodyParserStatus(error);
  if (parserStatus !== null) {
    const parserError = error as BodyParserError;

    return {
      status: parserStatus,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: bodyParserMessage(parserError.type ?? ''),
          retryable: false,
          details: {},
        },
      },
    };
  }

  return {
    status: STATUS_BY_CODE.INTERNAL_ERROR,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        retryable: false,
        details: {},
      },
    },
  };
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const result = toErrorEnvelope(error);
    const requestId = getRequestId(res);

    if (result.status >= 500) {
      logger.error(
        { err: error, requestId, method: req.method, url: req.originalUrl },
        'Request failed',
      );
    } else {
      logger.warn(
        { requestId, code: result.body.error.code, method: req.method, url: req.originalUrl },
        'Request rejected',
      );
    }

    res.status(result.status).json(result.body);
  };
}
