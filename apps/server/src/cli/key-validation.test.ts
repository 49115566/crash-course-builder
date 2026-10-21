import { describe, expect, it, vi } from 'vitest';

import { validateDeepSeekKey } from './key-validation.js';

describe('validateDeepSeekKey', () => {
  it('validates against the models endpoint without exposing the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await validateDeepSeekKey({
      baseUrl: 'https://example.test/',
      key: 'secret-key',
      fetchImpl,
    });

    expect(result).toEqual({ valid: true, message: 'The DeepSeek key is valid.' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret-key' },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('maps authentication, balance, and server failures', async () => {
    for (const [status, expected] of [
      [401, 'rejected'],
      [402, 'insufficient balance'],
      [503, 'HTTP 503'],
    ] as const) {
      const result = await validateDeepSeekKey({
        baseUrl: 'https://example.test',
        key: 'secret',
        fetchImpl: async () => new Response('', { status }),
      });
      expect(result.valid).toBe(false);
      expect(result.message).toContain(expected);
    }
  });

  it('handles network and timeout failures', async () => {
    const network = await validateDeepSeekKey({
      baseUrl: 'https://example.test',
      key: 'secret',
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(network).toMatchObject({ valid: false });
    expect(network.message).toContain('fetch failed');

    const timeout = await validateDeepSeekKey({
      baseUrl: 'https://example.test',
      key: 'secret',
      timeoutMs: 5,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    });
    expect(timeout).toEqual({ valid: false, message: 'DeepSeek key validation timed out.' });
  });
});
