import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { routeForSession } from '../../../core/sessions/session-routing';
import { SessionGate } from '../components/session-gate';
import { SessionWizardStore } from '../wizard.store';

@Component({
  selector: 'ccb-session-redirect-page',
  imports: [SessionGate],
  template: `
    @if (store.loadStatus() === 'error') {
      <ccb-session-gate
        [errorMessage]="store.loadError()?.message ?? 'This session could not be loaded.'"
        (retry)="retry()"
      />
    } @else {
      <ccb-session-gate [errorMessage]="null" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionRedirectPage {
  private readonly router = inject(Router);
  protected readonly store = inject(SessionWizardStore);
  private readonly retrying = signal(false);

  protected async retry(): Promise<void> {
    if (this.retrying()) return;
    this.retrying.set(true);
    try {
      const loaded = await this.store.retryLoad();
      const session = this.store.session();
      if (loaded && session !== null) {
        await this.router.navigateByUrl(routeForSession(session), { replaceUrl: true });
      }
    } finally {
      this.retrying.set(false);
    }
  }
}
