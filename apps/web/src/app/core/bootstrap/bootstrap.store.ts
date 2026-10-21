import { Injectable, computed, inject, signal } from '@angular/core';
import type { BootstrapData } from '@ccb/contracts';
import { firstValueFrom } from 'rxjs';

import { BootstrapService } from '../api/bootstrap.service';
import type { ApiClientError } from '../api/api-error';

type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'error';

interface BootstrapState {
  status: BootstrapStatus;
  data: BootstrapData | null;
  error: ApiClientError | null;
}

@Injectable({ providedIn: 'root' })
export class BootstrapStore {
  private readonly service = inject(BootstrapService);
  private readonly state = signal<BootstrapState>({ status: 'idle', data: null, error: null });

  readonly status = computed(() => this.state().status);
  readonly data = computed(() => this.state().data);
  readonly error = computed(() => this.state().error);
  readonly keyConfigured = computed(() => this.state().data?.key.configured ?? null);
  readonly keySource = computed(() => this.state().data?.key.source ?? null);
  readonly model = computed(() => this.state().data?.model ?? null);
  readonly keyMissing = computed(() => this.keyConfigured() === false);

  async load(): Promise<void> {
    if (this.state().status === 'loading' || this.state().status === 'ready') return;
    this.state.update((state) => ({ ...state, status: 'loading', error: null }));

    try {
      const data = await firstValueFrom(this.service.getBootstrap());
      this.state.set({ status: 'ready', data, error: null });
    } catch (error) {
      this.state.set({ status: 'error', data: null, error: error as ApiClientError });
    }
  }

  async refresh(): Promise<void> {
    this.state.update((state) => ({ ...state, status: 'idle' }));
    await this.load();
  }
}
