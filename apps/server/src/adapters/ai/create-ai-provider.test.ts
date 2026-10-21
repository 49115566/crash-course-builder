import { describe, expect, it } from 'vitest';

import { FakeAiProvider } from '../fake-ai/fake-ai-provider.js';
import { makeConfig, makeSilentLogger } from '../../test/test-config.js';
import { createAiProvider } from './create-ai-provider.js';

describe('createAiProvider', () => {
  it('passes fake AI controls to the deterministic provider', () => {
    const provider = createAiProvider(
      makeConfig({
        aiProvider: 'fake',
        fakeAi: {
          delayMs: 5,
          chunkSize: 7,
          failure: {
            scope: 'section',
            sectionNumber: 2,
            afterChunks: 1,
            code: 'AI_UPSTREAM',
          },
          failureOnce: true,
        },
      }),
      {
        resolve: async () => ({ key: 'test-key', source: 'environment' }),
        describe: async () => ({ configured: true, source: 'environment' }),
        setKey: async () => ({ source: 'environment' }),
        removeKey: async () => ({ removed: false, environmentStillSet: false }),
      },
      makeSilentLogger(),
    );

    expect(provider).toBeInstanceOf(FakeAiProvider);
  });
});
