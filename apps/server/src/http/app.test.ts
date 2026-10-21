import { Writable } from 'node:stream';

import {
  apiSuccessSchema,
  healthDataSchema,
  REQUEST_ID_HEADER,
  type ApiError,
} from '@ccb/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../logger.js';
import { makeTestApp, type TestAppContext } from '../test/library-fixtures.js';
import { createApp } from './app.js';

async function withApp(
  run: (context: TestAppContext) => Promise<void>,
  configure?: (context: TestAppContext) => ReturnType<typeof createApp>,
): Promise<void> {
  const context = await makeTestApp();

  try {
    const app = configure?.(context) ?? context.app;
    await run({ ...context, app });
  } finally {
    await context.cleanup();
  }
}

describe('HTTP application', () => {
  it('serves a contract-valid health response with a request id', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).get('/api/health').expect(200);
      const parsed = apiSuccessSchema(healthDataSchema).parse(response.body);
      const requestId = response.headers[REQUEST_ID_HEADER];

      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(parsed.requestId).toBe(requestId);
      expect(parsed.data).toMatchObject({
        status: 'ok',
        version: '0.1.0-test',
        checks: {
          process: { status: 'ok' },
          library: { status: 'ok' },
          key: { status: 'unknown' },
        },
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    });
  });

  it('returns a JSON error envelope for unknown API routes', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app).get('/api/unknown').expect(404);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body as ApiError).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          retryable: false,
          details: {},
        },
      });
      expect(response.headers[REQUEST_ID_HEADER]).toBeTruthy();
    });
  });

  it('returns a validation error for malformed JSON', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);

      const body = response.body as ApiError;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('malformed JSON');
    });
  });

  it('returns a validation envelope for oversized request bodies', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: 'x'.repeat(70_000) }))
        .expect(413);

      const body = response.body as ApiError;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('too large');
    });
  });

  it('returns a plain not-found response for non-API routes without a build', async () => {
    await withApp(async ({ app }) => {
      const response = await request(app)
        .get('/courses/new')
        .set('Accept', 'text/html')
        .expect(404);

      expect(response.text).toBe('Not found');
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  it('redacts sensitive request headers from logs', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });
    const logger = createLogger({ logLevel: 'info' }, stream);

    await withApp(
      async ({ app }) => {
        await request(app)
          .get('/api/unknown')
          .set('Authorization', 'Bearer super-secret-token')
          .set('Cookie', 'session=super-secret-cookie')
          .expect(404);

        await new Promise((resolve) => setImmediate(resolve));
        const logs = chunks.join('');

        expect(logs).toContain('[Redacted]');
        expect(logs).not.toContain('super-secret');
      },
      (context) =>
        createApp({
          config: context.config,
          logger,
          version: '0.1.0-test',
          libraryService: context.service,
        }),
    );
  });
});
