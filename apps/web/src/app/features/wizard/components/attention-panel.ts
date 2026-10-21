import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SessionData, SessionError } from '@ccb/contracts';

import { pauseReasonCopy } from '../../../core/sessions/session-routing';
import { sessionErrorHint } from '../../../core/sessions/session-errors';

@Component({
  selector: 'ccb-attention-panel',
  template: `
    <section class="attention" aria-labelledby="attention-title">
      <div class="attention__heading">
        <span class="attention__mark" aria-hidden="true"></span>
        <div>
          <p class="ccb-eyebrow" [class.ccb-eyebrow--danger]="session().status === 'failed'">
            {{ session().status === 'failed' ? 'Paused — needs attention' : 'Paused' }}
          </p>
          <h2 id="attention-title">{{ heading() }}</h2>
        </div>
      </div>

      @if (reasonCopy(); as copy) {
        <p class="attention__reason">{{ copy }}</p>
      }

      @if (error(); as error) {
        <div class="attention__error" role="alert">
          <p class="attention__error-message">{{ error.message }}</p>
          <p class="attention__error-hint">{{ errorHint() }}</p>
        </div>
      }

      <p class="attention__manual">
        Nothing restarts automatically. Resume only when you are ready; completed work is kept.
      </p>

      <div class="attention__actions">
        <button
          type="button"
          class="ccb-button ccb-button--primary"
          [disabled]="busy()"
          (click)="resumeRequested.emit()"
        >
          {{ resuming() ? 'Resuming…' : resumeLabel() }}
        </button>
      </div>
    </section>
  `,
  styleUrl: './attention-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttentionPanel {
  readonly session = input.required<SessionData>();
  readonly error = input<SessionError | null>(null);
  readonly busy = input(false);
  readonly resuming = input(false);
  readonly resumeRequested = output<void>();

  protected readonly reasonCopy = computed(() => pauseReasonCopy(this.session()));

  protected readonly heading = computed(() => {
    const session = this.session();
    if (session.status === 'paused') {
      return session.stage === 'outline' ? 'Outline generation paused' : 'Writing is paused';
    }
    if (session.stage === 'outline') return 'The outline needs another try';
    if (session.stage === 'finalization') return 'The course could not be saved yet';
    return 'Writing is paused';
  });

  protected readonly resumeLabel = computed(() => {
    const stage = this.session().stage;
    if (stage === 'outline') return 'Try outline again';
    if (stage === 'finalization') return 'Finish saving';
    return 'Resume writing';
  });

  protected readonly errorHint = computed(() => {
    const error = this.error();
    return error === null ? '' : sessionErrorHint(error);
  });
}
