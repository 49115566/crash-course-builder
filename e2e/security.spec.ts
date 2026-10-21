import http from 'node:http';
import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';

import { expect, test } from './support/app-fixtures';

interface RawRequestOptions {
  headers?: Record<string, string>;
  body?: string;
}

function rawRequest(
  baseURL: string,
  method: string,
  route: string,
  options: RawRequestOptions = {},
): Promise<{ status: number; text: string }> {
  const url = new URL(baseURL);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: route,
        method,
        headers: options.headers ?? {},
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, text });
        });
      },
    );
    request.on('error', reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

test.use({ appKey: 'security' });

test.describe('local service security', () => {
  test('serves CSP headers with a matching Angular nonce', async ({ request }) => {
    const response = await request.get('/');
    const html = await response.text();
    const csp = response.headers()['content-security-policy'] ?? '';
    const nonce = /<ccb-root[^>]*ngCspNonce="([^"]+)"/.exec(html)?.[1];

    expect(response.status()).toBe(200);
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce ?? ''}'`);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
  });

  test('rejects mutations without the CSRF header and non-local origins', async ({ app }) => {
    const missing = await rawRequest(app.baseURL, 'POST', '/api/subjects', {
      body: JSON.stringify({ name: 'Rejected' }),
    });
    expect(missing.status).toBe(403);
    expect(JSON.parse(missing.text).error.code).toBe('FORBIDDEN');

    const evilOrigin = await rawRequest(app.baseURL, 'POST', '/api/subjects', {
      headers: {
        [MUTATION_HEADER_NAME]: MUTATION_HEADER_VALUE,
        'content-type': 'application/json',
        Origin: 'https://attacker.example',
      },
      body: JSON.stringify({ name: 'Rejected' }),
    });
    expect(evilOrigin.status).toBe(403);

    const evilHost = await rawRequest(app.baseURL, 'GET', '/api/health', {
      headers: { Host: 'attacker.example' },
    });
    expect(evilHost.status).toBe(403);
  });

  test('rejects a mutation sent by page code with the wrong header', async ({ app, browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { [MUTATION_HEADER_NAME]: 'wrong' },
    });
    const page = await context.newPage();

    try {
      await page.goto(app.baseURL);
      const status = await page.evaluate(async () => {
        const response = await fetch('/api/subjects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'No CSRF Header' }),
        });
        return response.status;
      });

      expect(status).toBe(403);
    } finally {
      await context.close();
    }
  });

  test('loads the app without CSP console violations', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    await page.goto('/courses/new');
    await expect(
      page.getByRole('heading', { name: 'What should this course teach?' }),
    ).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
