import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

function captureLogs(): { logger: ReturnType<typeof createLogger>; read: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });

  return {
    logger: createLogger({ logLevel: 'info' }, stream),
    read: () => chunks.join(''),
  };
}

describe('createLogger', () => {
  it('redacts authorization, cookies, API keys, and nested secrets', async () => {
    const { logger, read } = captureLogs();

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer super-secret-token',
            cookie: 'session=super-secret-cookie',
            'x-api-key': 'super-secret-header-key',
          },
        },
        apiKey: 'super-secret-api-key',
        nested: {
          password: 'super-secret-password',
          secret: 'super-secret-value',
          key: 'super-secret-nested-key',
        },
      },
      'redaction test',
    );

    await new Promise((resolve) => setImmediate(resolve));
    const output = read();

    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('super-secret');
    expect(output).toContain('redaction test');
  });
});
