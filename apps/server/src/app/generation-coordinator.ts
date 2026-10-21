import { randomUUID } from 'node:crypto';

export interface ActiveRun {
  sessionId: string;
  runId: string;
  abortController: AbortController;
  pauseRequested: boolean;
  cancelled: boolean;
  abortReason?: 'stop' | 'interrupted' | 'delete';
}

export class GenerationCoordinator {
  private active: ActiveRun | null = null;

  tryBegin(sessionId: string): ActiveRun | null {
    if (this.active !== null) {
      return null;
    }

    const run: ActiveRun = {
      sessionId,
      runId: randomUUID(),
      abortController: new AbortController(),
      pauseRequested: false,
      cancelled: false,
    };
    this.active = run;
    return run;
  }

  getActiveSessionId(): string | null {
    return this.active?.sessionId ?? null;
  }

  isCurrent(sessionId: string, runId: string): boolean {
    return (
      this.active !== null &&
      this.active.sessionId === sessionId &&
      this.active.runId === runId &&
      !this.active.cancelled
    );
  }

  shouldPause(sessionId: string, runId: string): boolean {
    return this.isCurrent(sessionId, runId) && this.active?.pauseRequested === true;
  }

  getSignal(sessionId: string, runId: string): AbortSignal | null {
    return this.active?.sessionId === sessionId && this.active.runId === runId
      ? this.active.abortController.signal
      : null;
  }

  requestPause(sessionId: string): boolean {
    if (this.active === null || this.active.sessionId !== sessionId) {
      return false;
    }

    this.active.pauseRequested = true;
    return true;
  }

  abort(sessionId: string, reason: 'stop' | 'interrupted' | 'delete' = 'stop'): boolean {
    if (this.active === null || this.active.sessionId !== sessionId) {
      return false;
    }

    this.active.cancelled = true;
    this.active.abortReason = reason;
    this.active.abortController.abort();
    return true;
  }

  cancelForDelete(sessionId: string): boolean {
    return this.abort(sessionId, 'delete');
  }

  getAbortReason(sessionId: string, runId: string): 'stop' | 'interrupted' | 'delete' | null {
    return this.active?.sessionId === sessionId && this.active.runId === runId
      ? (this.active.abortReason ?? null)
      : null;
  }

  finish(sessionId: string, runId: string): void {
    if (this.active?.sessionId === sessionId && this.active.runId === runId) {
      this.active = null;
    }
  }

  abortAll(): string[] {
    const active = this.active;

    if (active === null) {
      return [];
    }

    active.cancelled = true;
    active.abortReason = 'interrupted';
    active.abortController.abort();
    return [active.sessionId];
  }
}
