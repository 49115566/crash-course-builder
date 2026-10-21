import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE, type ApiError } from '@ccb/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { makeTestApp, type TestAppContext } from '../test/library-fixtures.js';
import { apiRequest } from '../test/api-request.js';

const contexts: TestAppContext[] = [];
const NONCE = 'test-nonce-value';

async function appContext(): Promise<TestAppContext> {
  const context = await makeTestApp({ nodeEnv: 'production' }, { cspNonce: NONCE });
  contexts.push(context);
  return context;
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
});

function errorOf(body: unknown): ApiError['error'] {
  return (body as ApiError).error;
}

describe('local request security', () => {
  it('sets a strict CSP with the configured nonce on every response', async () => {
    const context = await appContext();
    const response = await request(context.app).get('/api/health').expect(200);
    const csp = response.headers['content-security-policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain(`style-src 'self' 'nonce-${NONCE}'`);
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("connect-src 'self'");
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    expect(response.headers['permissions-policy']).toContain('camera=()');
  });

  it('rejects a non-loopback Host header even for reads', async () => {
    const context = await appContext();
    const response = await request(context.app)
      .get('/api/health')
      .set('Host', 'attacker.example')
      .expect(403);

    expect(errorOf(response.body).code).toBe('FORBIDDEN');
    expect(response.headers['content-security-policy']).toContain(NONCE);
  });

  it('rejects non-local and null origins', async () => {
    const context = await appContext();

    for (const origin of ['https://attacker.example', 'null', 'file:///tmp/test']) {
      const response = await request(context.app)
        .get('/api/library')
        .set('Origin', origin)
        .expect(403);
      expect(errorOf(response.body).code).toBe('FORBIDDEN');
    }
  });

  it('accepts loopback origins and no Origin header', async () => {
    const context = await appContext();

    await request(context.app).get('/api/health').expect(200);
    await request(context.app)
      .get('/api/health')
      .set('Origin', 'http://127.0.0.1:4310')
      .expect(200);
  });

  it('enforces the configured host port in production', async () => {
    const context = await makeTestApp({ nodeEnv: 'production', port: 4310 }, { cspNonce: NONCE });
    contexts.push(context);

    await request(context.app).get('/api/health').set('Host', '127.0.0.1:4310').expect(200);
    await request(context.app).get('/api/health').set('Host', 'localhost:4310').expect(200);
    await request(context.app).get('/api/health').set('Host', '127.0.0.1:9999').expect(403);
    await request(context.app)
      .get('/api/health')
      .set('Origin', 'http://127.0.0.1:4200')
      .expect(403);
  });

  it('requires the mutation header on every mutating API request', async () => {
    const context = await appContext();

    const missing = await request(context.app)
      .post('/api/subjects')
      .send({ name: 'Security' })
      .expect(403);
    expect(errorOf(missing.body).code).toBe('FORBIDDEN');

    const wrong = await request(context.app)
      .post('/api/subjects')
      .set(MUTATION_HEADER_NAME, 'wrong')
      .send({ name: 'Security' })
      .expect(403);
    expect(errorOf(wrong.body).code).toBe('FORBIDDEN');

    await apiRequest(context.app).post('/api/subjects').send({ name: 'Security' }).expect(201);
  });

  it('does not require the mutation header for reads or SSE', async () => {
    const context = await appContext();

    await request(context.app).get('/api/health').expect(200);
    await request(context.app).get('/api/library').expect(200);
  });

  it('uses the header constant value expected by the client', async () => {
    expect(MUTATION_HEADER_NAME).toBe('x-ccb-request');
    expect(MUTATION_HEADER_VALUE).toBe('1');
  });
});
