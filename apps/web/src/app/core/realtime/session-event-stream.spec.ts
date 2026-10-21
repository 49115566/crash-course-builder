import type { SessionEvent } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionConnectionState } from './session-event-stream';
import { SessionEventStream } from './session-event-stream';
import { makeDraftSession } from '../../testing/session-fixtures';

class FakeEventSource {
  readyState = 0;
  readonly close = vi.fn(() => {
    this.readyState = 2;
  });
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  error(state: 0 | 2): void {
    this.readyState = state;
    this.emit('error');
  }

  emit(type: string, payload?: unknown): void {
    const event =
      payload === undefined
        ? new Event(type)
        : (new MessageEvent(type, { data: JSON.stringify(payload) }) as Event);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('SessionEventStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses named events and reports connection state', () => {
    const source = new FakeEventSource();
    const events: SessionEvent[] = [];
    const states: SessionConnectionState[] = [];
    const stream = new SessionEventStream({
      url: '/api/sessions/1/events',
      factory: () => source as unknown as EventSource,
      onEvent: (event) => events.push(event),
      onState: (state) => states.push(state),
    });

    stream.connect();
    source.open();
    const session = makeDraftSession();
    source.emit('snapshot', {
      type: 'snapshot',
      sessionId: session.id,
      at: session.updatedAt,
      session,
    });
    source.emit('outline_delta', {
      type: 'outline_delta',
      sessionId: session.id,
      at: session.updatedAt,
      text: '# Draft',
    });
    source.emit('outline_delta', 'not json');

    expect(states).toContain('connecting');
    expect(states).toContain('open');
    expect(events.map((event) => event.type)).toEqual(['snapshot', 'outline_delta', 'unknown']);
    expect(events[0]?.type === 'snapshot' && events[0].session.id).toBe(session.id);

    stream.close();
    expect(source.close).toHaveBeenCalled();
    expect(states.at(-1)).toBe('closed');
  });

  it('reconnects after a permanently closed transport', () => {
    const sources: FakeEventSource[] = [];
    const factory = (): EventSource => {
      const source = new FakeEventSource();
      sources.push(source);
      return source as unknown as EventSource;
    };
    const states: SessionConnectionState[] = [];
    const stream = new SessionEventStream({
      url: '/api/sessions/1/events',
      factory,
      onEvent: () => undefined,
      onState: (state) => states.push(state),
    });

    stream.connect();
    sources[0]?.open();
    sources[0]?.error(2);
    expect(states).toContain('reconnecting');

    vi.advanceTimersByTime(1_000);
    expect(sources).toHaveLength(2);

    stream.close();
    vi.advanceTimersByTime(10_000);
    expect(sources).toHaveLength(2);
  });

  it('relies on browser reconnect while the source is still connecting', () => {
    const source = new FakeEventSource();
    const states: SessionConnectionState[] = [];
    const stream = new SessionEventStream({
      url: '/api/sessions/1/events',
      factory: () => source as unknown as EventSource,
      onEvent: () => undefined,
      onState: (state) => states.push(state),
      onTransportError: () => states.push('closed'),
    });

    stream.connect();
    source.error(0);
    expect(states).toContain('reconnecting');
    expect(states).toContain('closed');
    stream.close();
  });
});
