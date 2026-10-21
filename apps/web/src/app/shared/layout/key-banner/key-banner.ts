import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { ToastService } from '../../ui/toast/toast.service';

@Component({
  selector: 'ccb-key-banner',
  template: `
    @if (visible()) {
      <aside class="key-banner" role="note" aria-labelledby="key-banner-title">
        <span class="key-banner__mark" aria-hidden="true">!</span>
        <div class="key-banner__body">
          <p id="key-banner-title" class="key-banner__title">
            DeepSeek key not set — generation is paused
          </p>
          <p class="key-banner__text">
            Your library and prompts still work. Run
            <code>npm run key:set</code> in the project terminal, then recheck.
          </p>
        </div>
        <div class="key-banner__actions">
          <button type="button" class="key-banner__button" (click)="copyCommand()">
            {{ copied() ? 'Copied' : 'Copy command' }}
          </button>
          <button
            type="button"
            class="key-banner__button key-banner__button--primary"
            [disabled]="checking()"
            (click)="recheck()"
          >
            {{ checking() ? 'Checking…' : 'Recheck' }}
          </button>
        </div>
      </aside>
    }
  `,
  styleUrl: './key-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyBanner {
  private readonly bootstrap = inject(BootstrapStore);
  private readonly toast = inject(ToastService);

  protected readonly copied = signal(false);
  protected readonly checking = signal(false);
  protected readonly visible = computed(() => this.bootstrap.keyMissing());

  protected async copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText('npm run key:set');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    } catch {
      this.toast.info('Run npm run key:set in the project terminal.');
    }
  }

  protected async recheck(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    try {
      await this.bootstrap.refresh();
      if (this.bootstrap.keyConfigured()) {
        this.toast.success('DeepSeek key found. Generation is ready.');
      } else if (this.bootstrap.status() !== 'error') {
        this.toast.info('No DeepSeek key found yet.');
      }
    } finally {
      this.checking.set(false);
    }
  }
}
