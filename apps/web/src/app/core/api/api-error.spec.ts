import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { toApiClientError } from './api-error';

describe('toApiClientError', () => {
  it('maps a standard error envelope', () => {
    const error = new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: {
        error: {
          code: 'NOT_FOUND',
          message: 'The course could not be found.',
          retryable: false,
          details: { courseId: 'course-1' },
        },
      },
    });

    expect(toApiClientError(error)).toEqual({
      code: 'NOT_FOUND',
      message: 'The course could not be found.',
      retryable: false,
      details: { courseId: 'course-1' },
      status: 404,
    });
  });

  it('maps transport failures to a retryable network error', () => {
    const error = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });

    expect(toApiClientError(error)).toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
      status: 0,
    });
  });

  it('maps unexpected responses to a safe internal error', () => {
    const error = new HttpErrorResponse({
      status: 502,
      statusText: 'Bad Gateway',
      error: '<html>proxy failure</html>',
    });

    expect(toApiClientError(error)).toMatchObject({
      code: 'INTERNAL_ERROR',
      retryable: true,
      status: 502,
    });
  });
});
