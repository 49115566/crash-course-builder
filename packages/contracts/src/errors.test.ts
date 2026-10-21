import { describe, expect, it } from 'vitest';

import { ERROR_CODES, apiErrorSchema, errorCodeSchema } from './errors.js';

describe('error contracts', () => {
  it('has unique error codes', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('accepts every declared error code', () => {
    for (const code of ERROR_CODES) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects unknown error codes', () => {
    expect(errorCodeSchema.safeParse('SOMETHING_ELSE').success).toBe(false);
  });

  it('accepts an error envelope and fills default details', () => {
    const parsed = apiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: 'The course could not be found.',
        retryable: false,
      },
    });

    expect(parsed.error.details).toEqual({});
  });

  it('rejects an error envelope with an empty message', () => {
    expect(
      apiErrorSchema.safeParse({
        error: { code: 'NOT_FOUND', message: '', retryable: false, details: {} },
      }).success,
    ).toBe(false);
  });
});
