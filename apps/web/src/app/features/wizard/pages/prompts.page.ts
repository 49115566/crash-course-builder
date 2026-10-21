import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ApiClientError } from '../../../core/api/api-error';
import { routeForSession } from '../../../core/sessions/session-routing';
import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { ActionErrorNotice } from '../components/action-error-notice';
import { KeyRequiredNotice } from '../components/key-required-notice';
import { SessionGate } from '../components/session-gate';
import { WizardHeadingFocus } from '../components/wizard-heading-focus';
import { SessionWizardStore } from '../wizard.store';

type MessageTab = 'system' | 'user';

@Component({
  selector: 'ccb-prompts-page',
  imports: [
    ActionErrorNotice,
    KeyRequiredNotice,
    RouterLink,
    SessionGate,
    Spinner,
    WizardHeadingFocus,
  ],
  templateUrl: './prompts.page.html',
  styleUrl: './prompts.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptsPage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(SessionWizardStore);
  protected readonly bootstrap = inject(BootstrapStore);

  protected readonly session = computed(() => this.store.session());
  protected readonly tab = signal<MessageTab>('user');
  protected readonly starting = signal(false);
  protected readonly copied = signal<MessageTab | null>(null);

  protected readonly keyMissing = computed(() => this.bootstrap.keyMissing() === true);
  protected readonly generating = computed(() => this.store.action() === 'start-outline');
  protected readonly tokenLabel = computed(() => {
    const tokens = this.session()?.startingPrompt.estimatedTokens ?? 0;
    return `~${tokens.toLocaleString()} tokens`;
  });

  constructor() {
    void this.bootstrap.load();
    effect(() => {
      const session = this.store.session();
      if (session !== null && session.status !== 'draft') {
        void this.router.navigateByUrl(routeForSession(session), { replaceUrl: true });
      }
    });
  }

  protected selectTab(tab: MessageTab): void {
    this.tab.set(tab);
  }

  protected async copyPrompt(tab: MessageTab): Promise<void> {
    const prompt = this.session()?.startingPrompt;
    if (prompt === undefined) return;

    try {
      await navigator.clipboard.writeText(tab === 'system' ? prompt.system : prompt.user);
      this.copied.set(tab);
      setTimeout(() => this.copied.set(null), 1600);
    } catch {
      this.toast.info('Select the prompt text and copy it manually.');
    }
  }

  protected async generate(): Promise<void> {
    if (this.keyMissing() || this.generating()) return;
    const started = await this.store.startOutline();
    if (started) {
      const session = this.store.session();
      if (session !== null) {
        await this.router.navigateByUrl(routeForSession(session));
      }
    }
  }

  protected retryLoad(): void {
    void this.store.retryLoad();
  }

  protected dismissError(): void {
    this.store.clearActionError();
  }

  protected error(): ApiClientError | null {
    return this.store.actionError();
  }
}
