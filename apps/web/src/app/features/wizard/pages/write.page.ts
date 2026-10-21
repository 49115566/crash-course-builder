import { Dialog } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { SessionSection } from '@ccb/contracts';
import { firstValueFrom } from 'rxjs';

import type { ApiClientError } from '../../../core/api/api-error';
import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { routeForSession } from '../../../core/sessions/session-routing';
import { countWords, readingMinutes } from '../../../core/text/word-count';
import { BadgeDirective } from '../../../shared/ui/badge/badge.directive';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { ActionErrorNotice } from '../components/action-error-notice';
import { AttentionPanel } from '../components/attention-panel';
import { KeyRequiredNotice } from '../components/key-required-notice';
import { SessionGate } from '../components/session-gate';
import { WizardHeadingFocus } from '../components/wizard-heading-focus';
import { ConfirmDialog, type ConfirmDialogData } from '../dialogs/confirm.dialog';
import { SessionWizardStore } from '../wizard.store';

@Component({
  selector: 'ccb-write-page',
  imports: [
    ActionErrorNotice,
    BadgeDirective,
    AttentionPanel,
    KeyRequiredNotice,
    RouterLink,
    SessionGate,
    Spinner,
    WizardHeadingFocus,
  ],
  templateUrl: './write.page.html',
  styleUrl: './write.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WritePage {
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(SessionWizardStore);
  protected readonly bootstrap = inject(BootstrapStore);
  private readonly manuscript = viewChild<ElementRef<HTMLElement>>('manuscript');

  protected readonly session = computed(() => this.store.session());
  protected readonly sections = computed(() => this.store.sections());
  protected readonly liveText = computed(() => this.store.currentLiveText());
  protected readonly activeSection = computed(() => this.store.activeSection());
  protected readonly activeNumber = computed(() => this.store.activeSectionNumber());
  protected readonly completed = computed(() => this.store.completedSections());
  protected readonly total = computed(() => this.store.totalSections());
  protected readonly progress = computed(() => this.store.progressPercent());
  protected readonly wordCount = computed(() => this.store.totalWords());
  protected readonly isGenerating = computed(() => this.store.isGenerating());
  protected readonly isFinalizing = computed(
    () => this.session()?.status === 'expanding' && this.session()?.stage === 'finalization',
  );
  protected readonly isComplete = computed(() => this.store.isComplete());
  protected readonly needsAttention = computed(() => this.store.needsAttention());
  protected readonly isPaused = computed(() => this.store.isPaused());
  protected readonly isWriting = computed(() => {
    const stage = this.session()?.stage;
    return this.session()?.status === 'expanding' && stage === 'sections';
  });
  protected readonly pausing = computed(
    () => this.store.pauseRequested() || this.store.action() === 'pause',
  );
  protected readonly keyMissing = computed(() => this.bootstrap.keyMissing() === true);
  protected readonly busy = computed(() => this.store.action() !== null);
  protected readonly actionError = computed(() => this.store.actionError());
  protected readonly connection = computed(() => this.store.connection());
  protected readonly connectionLabel = computed(() => {
    switch (this.connection()) {
      case 'open':
        return 'Live';
      case 'connecting':
        return 'Connecting';
      case 'reconnecting':
        return 'Reconnecting';
      default:
        return 'Offline';
    }
  });
  protected readonly stats = computed(() => {
    const session = this.session();
    const stored = this.store.completionStats();
    if (stored !== null) return stored;
    const words =
      session?.sections.reduce(
        (totalWords, section) => totalWords + countWords(section.markdown ?? ''),
        0,
      ) ?? 0;
    return {
      sections: session?.sections.length ?? 0,
      words,
      readingMinutes: readingMinutes(words),
    };
  });

  constructor() {
    void this.bootstrap.load();

    effect(() => {
      const session = this.store.session();
      if (
        session !== null &&
        (session.status === 'draft' ||
          session.status === 'outline_review' ||
          session.status === 'generating_outline')
      ) {
        void this.router.navigateByUrl(routeForSession(session), { replaceUrl: true });
      }
    });

    effect(() => {
      const text = this.liveText();
      const element = this.manuscript()?.nativeElement;
      if (element === undefined || text.length === 0) return;
      const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
      if (nearBottom) {
        setTimeout(() => {
          element.scrollTop = element.scrollHeight;
        }, 0);
      }
    });
  }

  protected sectionWords(section: SessionSection): number {
    return countWords(section.markdown ?? '');
  }

  protected async pause(): Promise<void> {
    if (this.pausing() || !this.store.canPause()) return;
    await this.store.pause();
  }

  protected async stop(): Promise<void> {
    if (!this.store.canStop()) return;
    const reference = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: {
        eyebrow: 'Stop writing',
        title: 'Stop and discard the unfinished section?',
        body: 'The current AI call is cancelled and its partial text is discarded. Every completed section is kept, and you can resume manually later.',
        confirmLabel: 'Stop writing',
        cancelLabel: 'Keep writing',
        tone: 'danger',
      },
      ariaLabel: 'Stop writing',
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
    if (this.busy()) return;
    await this.store.resume();
  }

  protected async copyPath(): Promise<void> {
    const path = this.store.savedPath();
    if (path === null) return;
    try {
      await navigator.clipboard.writeText(path);
      this.toast.success('Saved path copied.');
    } catch {
      this.toast.info('Select the path and copy it manually.');
    }
  }

  protected reconnect(): void {
    this.store.reconnect();
  }

  protected dismissError(): void {
    this.store.clearActionError();
  }

  protected retryLoad(): void {
    void this.store.retryLoad();
  }

  protected error(): ApiClientError | null {
    return this.store.actionError();
  }

  protected lastError() {
    return this.store.lastError();
  }
}
