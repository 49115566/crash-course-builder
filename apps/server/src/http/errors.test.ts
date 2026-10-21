import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, NotFoundError, toErrorEnvelope } from './errors.js';

describe('toErrorEnvelope', () => {
  it('maps not-found errors', () => {
    const result = toErrorEnvelope(new NotFoundError('Missing course.'));

    expect(result).toEqual({
      status: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Missing course.',
          retryable: false,
          details: {},
        },
      },
    });
  });

  it('honors custom app error status and retryability', () => {
    const result = toErrorEnvelope(
      new AppError('AI_RATE_LIMITED', 'Slow down.', {
        status: 429,
        retryable: true,
        details: { retryAfterSeconds: 10 },
      }),
    );

    expect(result.status).toBe(429);
    expect(result.body.error).toMatchObject({
      code: 'AI_RATE_LIMITED',
      retryable: true,
      details: { retryAfterSeconds: 10 },
    });
  });

  it('maps Zod failures without echoing input values', () => {
    const parsed = z.object({ name: z.string().min(3) }).safeParse({ name: 'x' });
    expect(parsed.success).toBe(false);

    if (parsed.success) {
      return;
    }

    const result = toErrorEnvelope(parsed.error);
    const serialized = JSON.stringify(result);

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(serialized).toContain('name');
    expect(serialized).not.toContain('"x"');
  });

  it('maps malformed JSON errors', () => {
    const error = new SyntaxError('Unexpected token');
    Object.assign(error, { type: 'entity.parse.failed', status: 400 });

    const result = toErrorEnvelope(error);

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(result.body.error.message).toContain('malformed JSON');
  });

  it('maps oversized request bodies', () => {
    const error = new SyntaxError('request entity too large');
    Object.assign(error, { type: 'entity.too.large', status: 413 });

    const result = toErrorEnvelope(error);

    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(result.body.error.message).toContain('too large');
  });

  it('hides unknown error details', () => {
    const result = toErrorEnvelope(new Error('database password is hunter2'));

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});
