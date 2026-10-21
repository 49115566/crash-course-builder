import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, startWith } from 'rxjs';

import type { WizardStep } from '../../core/sessions/session-routing';
import { ConfirmDialog, type ConfirmDialogData } from './dialogs/confirm.dialog';
import { WizardProgress } from './components/wizard-progress';
import { SessionWizardStore } from './wizard.store';

@Component({
  selector: 'ccb-wizard-layout',
  imports: [RouterLink, RouterOutlet, WizardProgress],
  templateUrl: './wizard-layout.html',
  styleUrl: './wizard-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardLayout {
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(SessionWizardStore);

  private readonly navigation = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
    ),
    { initialValue: null },
  );

  protected readonly currentStep = computed<WizardStep>(() => {
    this.navigation();
    return stepFromUrl(this.router.url);
  });

  protected readonly active = computed(() => this.store.session() !== null);

  constructor() {
    this.destroyRef.onDestroy(() => this.store.dispose());
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.store.clearActionError());
  }

  protected async discard(): Promise<void> {
    const session = this.store.session();
    if (session === null) return;

    const writing = session.status === 'generating_outline' || session.status === 'expanding';
    const reference = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: {
        eyebrow: writing ? 'Stop and discard' : 'Discard session',
        title: writing ? 'Stop writing and discard this session?' : 'Discard this session?',
        body: writing
          ? 'The active AI call is stopped and the unsaved session is deleted. Completed sections in this session are discarded. Courses already saved to your library are not affected.'
          : 'The draft, outline, prompts, and any generated sections are deleted. Courses already saved to your library are not affected.',
        confirmLabel: 'Discard session',
        cancelLabel: 'Keep session',
        tone: 'danger',
      },
      ariaLabel: 'Discard session',
      panelClass: 'ccb-dialog-panel',
      backdropClass: 'ccb-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });

    if ((await firstValueFrom(reference.closed)) !== true) return;
    if (await this.store.discard()) {
      await this.router.navigate(['/']);
    }
  }
}

function stepFromUrl(url: string): WizardStep {
  const path = url.split('?')[0] ?? '';
  if (path.endsWith('/prompts')) return 'prompts';
  if (path.endsWith('/outline')) return 'outline';
  if (path.endsWith('/write')) return 'write';
  return 'details';
}
