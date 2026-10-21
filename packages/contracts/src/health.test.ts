import { describe, expect, it } from 'vitest';

import { healthCheckSchema, healthDataSchema } from './health.js';

describe('health contracts', () => {
  it('accepts a complete health payload', () => {
    const result = healthDataSchema.safeParse({
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: 42,
      checks: {
        process: { status: 'ok' },
        library: { status: 'unknown', message: 'Library checks begin in Milestone 1.' },
        key: { status: 'unknown' },
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects negative uptime', () => {
    const result = healthDataSchema.safeParse({
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: -1,
      checks: {
        process: { status: 'ok' },
        library: { status: 'unknown' },
        key: { status: 'unknown' },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown check statuses', () => {
    expect(healthCheckSchema.safeParse({ status: 'fine' }).success).toBe(false);
  });
});
