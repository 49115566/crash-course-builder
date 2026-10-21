import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'EXPANSION_STARTED',
  'GENERATION_BUSY',
  'LIBRARY_UNAVAILABLE',
  'LIBRARY_SCAN_FAILED',
  'KEY_MISSING',
  'AI_AUTH_INVALID',
  'AI_INSUFFICIENT_BALANCE',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_ABORTED',
  'AI_NETWORK',
  'AI_UPSTREAM',
  'OUTLINE_INVALID',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorDetails = ApiError['error']['details'];
