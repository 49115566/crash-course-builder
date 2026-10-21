import type { SessionEvent } from '@ccb/contracts';

type Listener = (event: SessionEvent) => void;
type CloseListener = () => void;

const COALESCE_MS = 50;

export interface SessionEventBusOptions {
  coalesceMs?: number;
}

export class SessionEventBus {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly closeListeners = new Map<string, Set<CloseListener>>();
  private readonly pending = new Map<string, SessionEvent>();
  private timer: NodeJS.Timeout | null = null;
  private readonly coalesceMs: number;

  constructor(options: SessionEventBusOptions = {}) {
    this.coalesceMs = options.coalesceMs ?? COALESCE_MS;
  }

  subscribe(sessionId: string, listener: Listener, onClose?: CloseListener): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);

    if (onClose !== undefined) {
      const closeListeners = this.closeListeners.get(sessionId) ?? new Set<CloseListener>();
      closeListeners.add(onClose);
      this.closeListeners.set(sessionId, closeListeners);
    }

    return () => {
      const current = this.listeners.get(sessionId);
      if (current !== undefined) {
        current.delete(listener);
        if (current.size === 0) this.listeners.delete(sessionId);
      }

      if (onClose !== undefined) {
        const currentClose = this.closeListeners.get(sessionId);
        if (currentClose !== undefined) {
          currentClose.delete(onClose);
          if (currentClose.size === 0) this.closeListeners.delete(sessionId);
        }
      }
    };
  }

  publish(event: SessionEvent): void {
    if (event.type === 'outline_delta' || event.type === 'section_delta') {
      this.bufferDelta(event);
      return;
    }

    this.flush(event.sessionId);
    this.notify(event);
  }

  flushNow(sessionId?: string): void {
    if (sessionId === undefined) {
      const ids = new Set([...this.pending.values()].map((entry) => entry.sessionId));
      for (const id of ids) this.flush(id);
      return;
    }

    this.flush(sessionId);
  }

  close(sessionId: string): void {
    this.discardPending(sessionId);
    const closeListeners = this.closeListeners.get(sessionId);
    this.listeners.delete(sessionId);
    this.closeListeners.delete(sessionId);

    for (const listener of closeListeners ?? []) {
      try {
        listener();
      } catch {
        // Ignore a viewer that cannot be closed.
      }
    }
  }

  shutdown(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const closeListeners = [...this.closeListeners.values()].flatMap((listeners) => [...listeners]);
    this.pending.clear();
    this.listeners.clear();
    this.closeListeners.clear();

    for (const listener of closeListeners) {
      try {
        listener();
      } catch {
        // Ignore a viewer that cannot be closed.
      }
    }
  }

  private bufferDelta(
    event: Extract<SessionEvent, { type: 'outline_delta' | 'section_delta' }>,
  ): void {
    const key =
      event.type === 'section_delta'
        ? `${event.sessionId}:section:${String(event.sectionNumber)}`
        : `${event.sessionId}:outline`;
    const existing = this.pending.get(key);

    if (existing === undefined) {
      this.pending.set(key, { ...event });
    } else if (existing.type === 'section_delta' && event.type === 'section_delta') {
      this.pending.set(key, { ...existing, text: existing.text + event.text, at: event.at });
    } else if (existing.type === 'outline_delta' && event.type === 'outline_delta') {
      this.pending.set(key, { ...existing, text: existing.text + event.text, at: event.at });
    }

    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        const ids = new Set([...this.pending.values()].map((entry) => entry.sessionId));
        for (const id of ids) this.flush(id);
      }, this.coalesceMs);
      this.timer.unref();
    }
  }

  private flush(sessionId: string): void {
    const events = [...this.pending.entries()]
      .filter(([, event]) => event.sessionId === sessionId)
      .map(([key]) => key);

    for (const key of events) {
      const event = this.pending.get(key);
      this.pending.delete(key);
      if (event !== undefined) this.notify(event);
    }

    if (this.pending.size === 0 && this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private discardPending(sessionId: string): void {
    for (const [key, event] of this.pending) {
      if (event.sessionId === sessionId) this.pending.delete(key);
    }
  }

  private notify(event: SessionEvent): void {
    const listeners = this.listeners.get(event.sessionId);

    if (listeners === undefined) return;

    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A broken viewer must never interrupt generation.
      }
    }
  }
}
