import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Spinner } from '../../../shared/ui/spinner/spinner';

@Component({
  selector: 'ccb-session-gate',
  imports: [Spinner],
  template: `
    @if (errorMessage(); as message) {
      <div class="session-gate session-gate--error" role="alert">
        <p class="ccb-eyebrow">Session unavailable</p>
        <h2>We could not load this course session</h2>
        <p>{{ message }}</p>
        <button type="button" class="ccb-button ccb-button--secondary" (click)="retry.emit()">
          Try again
        </button>
      </div>
    } @else {
      <div class="session-gate" role="status" aria-live="polite">
        <ccb-spinner />
        <p>Opening your session…</p>
      </div>
    }
  `,
  styleUrl: './session-gate.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionGate {
  readonly errorMessage = input<string | null>(null);
  readonly retry = output<void>();
}
