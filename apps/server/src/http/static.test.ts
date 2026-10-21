import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ApiError } from '@ccb/contracts';
import { apiRequest } from '../test/api-request.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../http/app.js';
import { makeTestApp, type TestAppContext } from '../test/library-fixtures.js';
import { makeSilentLogger } from '../test/test-config.js';

const NONCE = 'static-test-nonce';

describe('static web serving', () => {
  let tempDir: string;
  let context: TestAppContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ccb-static-'));
    await mkdir(path.join(tempDir, 'assets'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'index.html'),
      '<!doctype html><html><body><ccb-root></ccb-root></body></html>',
    );
    await writeFile(path.join(tempDir, 'assets', 'main-ABCDEFGH.js'), 'console.log("app");');
    await writeFile(path.join(tempDir, 'assets', 'chunk-AbCdEfGh.js'), 'console.log("chunk");');
    await writeFile(
      path.join(tempDir, 'favicon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" />',
    );

    context = await makeTestApp({ webDistDir: tempDir });
    context.app = createApp({
      config: context.config,
      logger: makeSilentLogger(),
      version: '0.1.0-test',
      libraryService: context.service,
      sessionService: context.sessionService,
      events: context.events,
      secrets: context.secrets,
      cspNonce: NONCE,
    });
  });

  afterEach(async () => {
    await context.cleanup();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('serves index.html without caching', async () => {
    const response = await apiRequest(context.app).get('/').set('Accept', 'text/html').expect(200);

    expect(response.text).toContain(`<ccb-root ngCspNonce="${NONCE}">`);
    expect(response.headers['content-security-policy']).toContain(`'nonce-${NONCE}'`);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('serves hashed assets with immutable caching', async () => {
    const response = await apiRequest(context.app).get('/assets/main-ABCDEFGH.js').expect(200);

    expect(response.text).toContain('console.log');
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.headers['cache-control']).toContain('max-age=31536000');
  });

  it('recognises lowercase Angular chunk hashes as immutable', async () => {
    const response = await apiRequest(context.app).get('/assets/chunk-AbCdEfGh.js').expect(200);

    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('uses short-lived caching for non-hashed public files', async () => {
    const response = await apiRequest(context.app).get('/favicon.svg').expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('falls back to index.html for extensionless HTML navigation', async () => {
    const response = await apiRequest(context.app)
      .get('/courses/new/session-1/outline')
      .set('Accept', 'text/html')
      .expect(200);

    expect(response.text).toContain(`<ccb-root ngCspNonce="${NONCE}">`);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not serve index.html for missing assets', async () => {
    const response = await apiRequest(context.app).get('/assets/missing.js').expect(404);

    expect(response.text).toBe('Not found');
  });

  it('does not fall back to index.html for API routes', async () => {
    const response = await apiRequest(context.app)
      .get('/api/unknown')
      .set('Accept', 'text/html')
      .expect(404);

    expect((response.body as ApiError).error.code).toBe('NOT_FOUND');
  });

  it('applies no-store and the nonce when index.html is requested directly', async () => {
    const response = await apiRequest(context.app).get('/index.html').expect(200);

    expect(response.text).toContain(`<ccb-root ngCspNonce="${NONCE}">`);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('preserves existing root attributes when injecting the nonce', async () => {
    await writeFile(
      path.join(tempDir, 'index.html'),
      '<!doctype html><html><body><ccb-root class="app" ngCspNonce="stale"></ccb-root></body></html>',
    );
    await context.cleanup();
    context = await makeTestApp({ webDistDir: tempDir });
    context.app = createApp({
      config: context.config,
      logger: makeSilentLogger(),
      version: '0.1.0-test',
      libraryService: context.service,
      sessionService: context.sessionService,
      events: context.events,
      secrets: context.secrets,
      cspNonce: NONCE,
    });

    const response = await apiRequest(context.app).get('/').set('Accept', 'text/html').expect(200);

    expect(response.text).toContain(`class="app" ngCspNonce="${NONCE}"`);
    expect(response.text).not.toContain('stale');
  });
});
