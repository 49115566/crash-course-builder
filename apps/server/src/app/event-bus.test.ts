import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionEvent } from '@ccb/contracts';
import { SessionEventBus } from './event-bus.js';

const sessionId = '123e4567-e89b-42d3-a456-426614174020';
const at = '2026-01-02T00:00:00.000Z';

function sectionDelta(text: string, sectionNumber = 1): SessionEvent {
  return { type: 'section_delta', sessionId, at, sectionNumber, text };
}

describe('SessionEventBus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces deltas into ordered batches', () => {
    vi.useFakeTimers();
    const bus = new SessionEventBus({ coalesceMs: 50 });
    const received: SessionEvent[] = [];
    bus.subscribe(sessionId, (event) => received.push(event));

    bus.publish(sectionDelta('a'));
    bus.publish(sectionDelta('b'));
    bus.publish(sectionDelta('c', 2));

    expect(received).toEqual([]);
    vi.advanceTimersByTime(50);

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ sectionNumber: 1, text: 'ab' });
    expect(received[1]).toMatchObject({ sectionNumber: 2, text: 'c' });
  });

  it('flushes pending deltas before non-delta events', () => {
    vi.useFakeTimers();
    const bus = new SessionEventBus({ coalesceMs: 50 });
    const received: SessionEvent[] = [];
    bus.subscribe(sessionId, (event) => received.push(event));

    bus.publish(sectionDelta('partial'));
    bus.publish({
      type: 'section_completed',
      sessionId,
      at,
      sectionNumber: 1,
      markdown: 'partial',
    });

    expect(received.map((event) => event.type)).toEqual(['section_delta', 'section_completed']);
  });

  it('supports unsubscribe, explicit flushes, and shutdown', () => {
    vi.useFakeTimers();
    const bus = new SessionEventBus({ coalesceMs: 50 });
    const received: string[] = [];
    const unsubscribe = bus.subscribe(sessionId, (event) => received.push(event.type));

    bus.publish(sectionDelta('a'));
    bus.flushNow();
    expect(received).toEqual(['section_delta']);

    bus.publish(sectionDelta('b'));
    bus.flushNow(sessionId);
    expect(received).toEqual(['section_delta', 'section_delta']);

    unsubscribe();
    bus.publish(sectionDelta('c'));
    bus.flushNow();
    expect(received).toEqual(['section_delta', 'section_delta']);

    const closed: string[] = [];
    bus.subscribe(
      sessionId,
      () => undefined,
      () => closed.push('closed'),
    );
    bus.publish(sectionDelta('pending'));
    bus.shutdown();
    expect(closed).toEqual(['closed']);
  });

  it('fans out to multiple subscribers and closes deleted sessions', () => {
    const bus = new SessionEventBus();
    const first: string[] = [];
    const second: string[] = [];
    let closed = 0;
    bus.subscribe(sessionId, (event) => first.push(event.type));
    bus.subscribe(
      sessionId,
      (event) => second.push(event.type),
      () => {
        closed += 1;
      },
    );

    bus.publish({
      type: 'outline_ready',
      sessionId,
      at,
      outline: {
        title: 'Course',
        cover: {},
        sections: [
          { number: 1, title: 'One', bullets: [] },
          { number: 2, title: 'Two', bullets: [] },
        ],
      },
      continuations: [],
    });

    expect(first).toEqual(['outline_ready']);
    expect(second).toEqual(['outline_ready']);
    bus.close(sessionId);
    expect(closed).toBe(1);
  });
});
