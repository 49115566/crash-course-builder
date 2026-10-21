import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { readSecretInput } from './secret-input.js';

describe('readSecretInput', () => {
  it('reads a trimmed key from piped input', async () => {
    const stdin = Readable.from(['  piped-key\n']);
    await expect(readSecretInput({ stdin })).resolves.toBe('piped-key');
  });

  it('rejects empty piped input', async () => {
    await expect(readSecretInput({ stdin: Readable.from(['   \n']) })).rejects.toThrow(
      'No API key',
    );
  });
});
