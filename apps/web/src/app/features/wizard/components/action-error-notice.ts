import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApiClientError } from '../../../core/api/api-error';
import { sessionErrorHint } from '../../../core/sessions/session-errors';

@Component({
  selector: 'ccb-action-error-notice',
  imports: [RouterLink],
  template: `
    @if (error(); as error) {
      <div class="action-notice" role="alert">
        <div class="action-notice__body">
          @if (error.code === 'GENERATION_BUSY') {
            <p class="action-notice__title">Another course is being generated</p>
            <p class="action-notice__text">
              Only one course can use the AI at a time. Finish or pause that course, then try again
              here. This session was not changed.
            </p>
            @if (activeSessionId(); as id) {
              <a class="action-notice__link" [routerLink]="['/courses/new', id]">
                Open the active course →
              </a>
            }
          } @else if (error.code === 'KEY_MISSING') {
            <p class="action-notice__title">A DeepSeek key is needed</p>
            <p class="action-notice__text">
              Run <code>npm run key:set</code> in the project terminal, then recheck the key.
            </p>
          } @else {
            <p class="action-notice__title">{{ error.message }}</p>
            <p class="action-notice__text">{{ hint() }}</p>
          }
        </div>

        <button type="button" class="action-notice__dismiss" (click)="dismiss.emit()">
          Dismiss
        </button>
      </div>
    }
  `,
  styleUrl: './action-error-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionErrorNotice {
  readonly error = input<ApiClientError | null>(null);
  readonly dismiss = output<void>();

  protected readonly hint = computed(() => {
    const error = this.error();
    return error === null ? '' : sessionErrorHint(error);
  });

  protected readonly activeSessionId = computed(() => {
    const value = this.error()?.details['activeSessionId'];
    return typeof value === 'string' ? value : null;
  });
}
