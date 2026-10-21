import { describe, expect, it } from 'vitest';

import {
  API_PREFIX,
  HEALTH_PATH,
  MUTATION_HEADER_NAME,
  MUTATION_HEADER_VALUE,
  REQUEST_ID_HEADER,
} from './constants.js';

describe('wire constants', () => {
  it('keeps the public API paths and headers stable', () => {
    expect(API_PREFIX).toBe('/api');
    expect(HEALTH_PATH).toBe('/health');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
    expect(MUTATION_HEADER_NAME).toBe('x-ccb-request');
    expect(MUTATION_HEADER_VALUE).toBe('1');
  });
});
