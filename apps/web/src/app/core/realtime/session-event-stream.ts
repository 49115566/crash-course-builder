import { InjectionToken } from '@angular/core';
import type { SessionEvent } from '@ccb/contracts';

export type SessionConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export type EventSourceFactory = (url: string) => EventSource;

export const EVENT_SOURCE_FACTORY = new InjectionToken<EventSourceFactory>('EVENT_SOURCE_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => new EventSource(url),
});

export interface SessionEventStreamOptions {
  url: string;
  factory: EventSourceFactory;
  onEvent: (event: SessionEvent) => void;
  onState: (state: SessionConnectionState) => void;
  onTransportError?: () => void;
}

const EVENT_TYPES = [
  'snapshot',
  'status',
  'outline_delta',
  'outline_ready',
  'section_started',
  'section_delta',
  'section_completed',
  'section_failed',
  'completed',
] as const;

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

export class SessionEventStream {
  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closed = false;
  private readonly listeners: Array<{ type: string; listener: EventListener }> = [];

  constructor(private readonly options: SessionEventStreamOptions) {}

  connect(): void {
    this.closed = false;
    this.clearReconnect();
    this.openSource();
  }

  close(): void {
    this.closed = true;
    this.clearReconnect();
    this.disposeSource();
    this.options.onState('closed');
  }

  private openSource(): void {
    if (this.closed) return;

    this.options.onState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const source = this.options.factory(this.options.url);
    this.source = source;

    const openListener = (): void => {
      if (this.source !== source) return;
      this.reconnectAttempt = 0;
      this.options.onState('open');
    };

    const errorListener = (): void => {
      if (this.source !== source || this.closed) return;
      this.options.onTransportError?.();

      if (source.readyState === 2) {
        this.disposeSource();
        this.scheduleReconnect();
      } else {
        this.options.onState('reconnecting');
      }
    };

    source.addEventListener('open', openListener);
    source.addEventListener('error', errorListener);

    for (const type of EVENT_TYPES) {
      const listener = (event: Event): void => {
        if (this.source !== source || this.closed) return;
        const message = event as MessageEvent<string>;
        this.options.onEvent(parseEvent(message.data));
      };
      source.addEventListener(type, listener);
      this.listeners.push({ type, listener });
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) return;

    this.options.onState('reconnecting');

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      10_000;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSource();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private disposeSource(): void {
    const source = this.source;
    if (source === null) return;
    source.close();
    this.source = null;
    this.listeners.length = 0;
  }
}

function parseEvent(data: string): SessionEvent {
  try {
    const parsed: unknown = JSON.parse(data);
    if (isRecord(parsed) && typeof parsed['type'] === 'string') {
      return parsed as SessionEvent;
    }
  } catch {
    // A malformed event is ignored; the next snapshot repairs state.
  }

  return { type: 'unknown' } as unknown as SessionEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
