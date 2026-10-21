import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ApiClientError } from '../../../core/api/api-error';
import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { expansionStarted, routeForSession } from '../../../core/sessions/session-routing';
import { readingMinutes } from '../../../core/text/word-count';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ActionErrorNotice } from '../components/action-error-notice';
import { AttentionPanel } from '../components/attention-panel';
import { KeyRequiredNotice } from '../components/key-required-notice';
import { SessionGate } from '../components/session-gate';
import { WizardHeadingFocus } from '../components/wizard-heading-focus';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { ConfirmDialog, type ConfirmDialogData } from '../dialogs/confirm.dialog';
import { SessionWizardStore } from '../wizard.store';

@Component({
  selector: 'ccb-outline-page',
  imports: [
    ActionErrorNotice,
    AttentionPanel,
    KeyRequiredNotice,
    SessionGate,
    Spinner,
    WizardHeadingFocus,
  ],
  templateUrl: './outline.page.html',
  styleUrl: './outline.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutlinePage {
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(SessionWizardStore);
  protected readonly bootstrap = inject(BootstrapStore);

  protected readonly session = computed(() => this.store.session());
  protected readonly outline = computed(() => this.session()?.outline ?? null);
  protected readonly generatingOutline = computed(
    () => this.session()?.status === 'generating_outline',
  );
  protected readonly review = computed(() => this.session()?.status === 'outline_review');
  protected readonly pausedOutline = computed(() => {
    const status = this.session()?.status;
    return (status === 'paused' || status === 'failed') && this.session()?.stage === 'outline';
  });
  protected readonly writingStarted = computed(() => {
    const session = this.session();
    return session !== null && expansionStarted(session);
  });
  protected readonly readOnly = computed(() => this.writingStarted() && this.outline() !== null);
  protected readonly keyMissing = computed(() => this.bootstrap.keyMissing() === true);
  protected readonly busy = computed(() => this.store.action() !== null);
  protected readonly actionError = computed(() => this.store.actionError());
  protected readonly liveText = computed(() => this.store.liveOutline());

  protected readonly sectionCount = computed(() => this.outline()?.sections.length ?? 0);
  protected readonly estimatedWords = computed(
    () => this.session()?.sections.reduce((total, section) => total + section.wordBudget, 0) ?? 0,
  );
  protected readonly estimatedMinutes = computed(() => readingMinutes(this.estimatedWords()));
  protected readonly remainingCalls = computed(() => this.sectionCount());

  constructor() {
    void this.bootstrap.load();
    effect(() => {
      const session = this.store.session();
      if (session !== null && session.status === 'draft') {
        void this.router.navigateByUrl(routeForSession(session), { replaceUrl: true });
      }
    });
  }

  protected async approve(): Promise<void> {
    if (this.keyMissing() || this.busy()) return;
    const approved = await this.store.approve();
    if (approved) {
      const session = this.store.session();
      if (session !== null) {
        await this.router.navigateByUrl(`/courses/new/${session.id}/write`);
      }
    }
  }

  protected async regenerate(): Promise<void> {
    if (!this.store.canRegenerate() || this.busy() || this.keyMissing()) return;
    const regenerated = await this.store.regenerateOutline();
    if (regenerated) {
      this.toast.success('Generating a new outline.');
      window.scrollTo({ top: 0 });
    }
  }

  protected async editInputs(): Promise<void> {
    const session = this.session();
    if (session === null) return;

    if (session.status === 'outline_review') {
      const reference = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
        data: {
          eyebrow: 'Edit inputs',
          title: 'Clear this outline and start again?',
          body: 'Saving new inputs removes the current outline, continuation prompts, and review state. You will return to the prompt preview and need to generate a new outline.',
          confirmLabel: 'Edit inputs',
          cancelLabel: 'Keep this outline',
          tone: 'danger',
        },
        ariaLabel: 'Edit inputs and clear outline',
        panelClass: 'ccb-dialog-panel',
        backdropClass: 'ccb-dialog-backdrop',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      });

      if ((await firstValueFrom(reference.closed)) !== true) return;
    }

    await this.router.navigate(['/courses/new', session.id, 'edit']);
  }

  protected async stopOutline(): Promise<void> {
    const reference = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: {
        eyebrow: 'Stop outline',
        title: 'Stop generating this outline?',
        body: 'The current AI call is cancelled and partial outline text is discarded. You can resume later with the same brief.',
        confirmLabel: 'Stop generating',
        cancelLabel: 'Keep generating',
        tone: 'danger',
      },
      ariaLabel: 'Stop outline generation',
      panelClass: 'ccb-dialog-panel',
      backdropClass: 'ccb-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });

    if ((await firstValueFrom(reference.closed)) === true) {
      await this.store.stop();
    }
  }

  protected async resume(): Promise<void> {
    await this.store.resume();
  }

  protected openProgress(): void {
    const session = this.session();
    if (session !== null) {
      void this.router.navigateByUrl(`/courses/new/${session.id}/write`);
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

  protected lastError() {
    return this.store.lastError();
  }
}
