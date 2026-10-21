import { describe, expect, it } from 'vitest';

import { apiSuccessSchema, scanWarningSchema } from './api.js';
import { healthDataSchema } from './health.js';

const healthData = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 12,
  checks: {
    process: { status: 'ok' },
    library: { status: 'unknown' },
    key: { status: 'unknown' },
  },
};

describe('apiSuccessSchema', () => {
  it('accepts a success envelope with warnings', () => {
    const result = apiSuccessSchema(healthDataSchema).safeParse({
      data: healthData,
      warnings: [{ code: 'missing_meta', message: 'Stored outside the library index.' }],
      requestId: 'request-1',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a success envelope without warnings', () => {
    const result = apiSuccessSchema(healthDataSchema).safeParse({
      data: healthData,
      requestId: 'request-1',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an envelope without a request id', () => {
    const result = apiSuccessSchema(healthDataSchema).safeParse({ data: healthData });

    expect(result.success).toBe(false);
  });
});

describe('scanWarningSchema', () => {
  it('requires a code and message', () => {
    expect(scanWarningSchema.safeParse({ code: 'x', message: 'Warning' }).success).toBe(true);
    expect(scanWarningSchema.safeParse({ code: '', message: 'Warning' }).success).toBe(false);
    expect(scanWarningSchema.safeParse({ code: 'x' }).success).toBe(false);
  });
});
