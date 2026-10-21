import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SessionData } from '@ccb/contracts';

import { expansionStarted, type WizardStep } from '../../../core/sessions/session-routing';

interface StepView {
  key: WizardStep;
  label: string;
  number: number;
  complete: boolean;
  current: boolean;
}

@Component({
  selector: 'ccb-wizard-progress',
  template: `
    <nav class="wizard-progress" aria-label="Course creation steps">
      <ol>
        @for (step of steps(); track step.key) {
          <li
            class="wizard-progress__step"
            [class.is-current]="step.current"
            [class.is-complete]="step.complete"
            [attr.aria-current]="step.current ? 'step' : null"
          >
            <span class="wizard-progress__marker" aria-hidden="true">
              @if (step.complete && !step.current) {
                <span class="wizard-progress__check">✓</span>
              } @else {
                {{ step.number }}
              }
            </span>
            <span class="wizard-progress__label">{{ step.label }}</span>
          </li>
        }
      </ol>
    </nav>
  `,
  styleUrl: './wizard-progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardProgress {
  readonly current = input.required<WizardStep>();
  readonly session = input<SessionData | null>(null);

  protected readonly steps = computed<StepView[]>(() => {
    const session = this.session();
    const writingStarted = session !== null && expansionStarted(session);
    const outlineReady = session?.outline !== undefined;
    const promptReady = session !== null;

    return [
      {
        key: 'details',
        label: 'Details',
        number: 1,
        complete: promptReady,
        current: this.current() === 'details',
      },
      {
        key: 'prompts',
        label: 'Prompt',
        number: 2,
        complete: outlineReady || writingStarted,
        current: this.current() === 'prompts',
      },
      {
        key: 'outline',
        label: 'Outline',
        number: 3,
        complete: writingStarted,
        current: this.current() === 'outline',
      },
      {
        key: 'write',
        label: 'Write',
        number: 4,
        complete: session?.status === 'completed',
        current: this.current() === 'write',
      },
    ];
  });
}
