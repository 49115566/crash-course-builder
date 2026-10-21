import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeltaBuffer, type DeltaFlush } from './delta-buffer';

describe('DeltaBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces outline and per-section text into one flush', () => {
    const flushes: DeltaFlush[] = [];
    const buffer = new DeltaBuffer((flush) => flushes.push(flush));

    buffer.appendOutline('Hello ');
    buffer.appendOutline('world');
    buffer.appendSection(1, 'A');
    buffer.appendSection(1, 'B');
    buffer.appendSection(2, 'C');

    expect(flushes).toHaveLength(0);
    vi.advanceTimersByTime(50);

    expect(flushes).toHaveLength(1);
    expect(flushes[0]?.outline).toBe('Hello world');
    expect(flushes[0]?.sections.get(1)).toBe('AB');
    expect(flushes[0]?.sections.get(2)).toBe('C');
  });

  it('flushes immediately and can reset pending text', () => {
    const flushes: DeltaFlush[] = [];
    const buffer = new DeltaBuffer((flush) => flushes.push(flush));

    buffer.appendOutline('now');
    buffer.flush();
    expect(flushes[0]?.outline).toBe('now');

    buffer.appendOutline('discard me');
    buffer.reset();
    vi.advanceTimersByTime(100);
    expect(flushes).toHaveLength(1);
  });
});
