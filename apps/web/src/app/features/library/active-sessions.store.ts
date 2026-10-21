import { Injectable, computed, inject, signal } from '@angular/core';
import type { SessionSummary } from '@ccb/contracts';
import { firstValueFrom } from 'rxjs';

import type { ApiClientError } from '../../core/api/api-error';
import { SessionApiService } from '../../core/api/session-api.service';
import { ToastService } from '../../shared/ui/toast/toast.service';

type SessionsStatus = 'loading' | 'ready' | 'error';

@Injectable()
export class ActiveSessionsStore {
  private readonly api = inject(SessionApiService);
  private readonly toast = inject(ToastService);
  private readonly state = signal<{
    status: SessionsStatus;
    sessions: SessionSummary[];
    error: ApiClientError | null;
  }>({ status: 'loading', sessions: [], error: null });
  private readonly discarding = signal<string | null>(null);

  readonly status = computed(() => this.state().status);
  readonly sessions = computed(() => this.state().sessions);
  readonly error = computed(() => this.state().error);
  readonly count = computed(() => this.sessions().length);
  readonly discardingSessionId = this.discarding.asReadonly();
  readonly busy = computed(() => this.discarding() !== null);
  readonly hasSessions = computed(() => this.sessions().length > 0);

  async load(options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      this.state.update((state) => ({ ...state, status: 'loading', error: null }));
    }

    try {
      const response = await firstValueFrom(this.api.listActive());
      this.state.set({ status: 'ready', sessions: response.sessions, error: null });
    } catch (error) {
      this.state.update((state) => ({
        ...state,
        status: state.sessions.length > 0 ? 'ready' : 'error',
        error: error as ApiClientError,
      }));
    }
  }

  async discard(sessionId: string): Promise<boolean> {
    if (this.discarding() !== null) return false;
    this.discarding.set(sessionId);

    try {
      await firstValueFrom(this.api.delete(sessionId));
      this.state.update((state) => ({
        ...state,
        sessions: state.sessions.filter((session) => session.id !== sessionId),
      }));
      this.toast.success('Session discarded.');
      return true;
    } catch (error) {
      this.toast.error((error as ApiClientError).message);
      return false;
    } finally {
      this.discarding.set(null);
    }
  }
}
