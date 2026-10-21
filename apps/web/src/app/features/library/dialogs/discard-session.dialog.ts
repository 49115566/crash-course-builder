import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { SessionSummary } from '@ccb/contracts';

export interface DiscardSessionDialogData {
  session: SessionSummary;
}

@Component({
  selector: 'ccb-discard-session-dialog',
  template: `
    <div class="ccb-dialog">
      <header class="ccb-dialog__header">
        <p class="ccb-eyebrow ccb-eyebrow--danger">Discard session</p>
        <h2 class="ccb-dialog__title">Discard “{{ data.session.title ?? data.session.topic }}”?</h2>
        <p class="ccb-dialog__body">
          @if (isActive()) {
            The active AI call is stopped and this session is deleted. Its unsaved outline and
            generated sections are discarded. Courses already saved to your library are not
            affected.
          } @else {
            This draft session, its prompts, and any generated sections are deleted. Courses already
            saved to your library are not affected.
          }
        </p>
      </header>

      <div class="ccb-dialog__note">
        <span class="ccb-dialog__note-label">Session</span>
        <span>{{ data.session.subject.name }} · {{ data.session.topic }}</span>
      </div>

      <footer class="ccb-dialog__actions">
        <button type="button" class="ccb-button ccb-button--ghost" (click)="cancel()">
          Keep session
        </button>
        <button type="button" class="ccb-button ccb-button--danger" (click)="confirm()">
          Discard session
        </button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscardSessionDialog {
  protected readonly data = inject<DiscardSessionDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<boolean | undefined>>(DialogRef);

  protected isActive(): boolean {
    return dataStatusActive(this.data.session);
  }

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}

function dataStatusActive(session: SessionSummary): boolean {
  return session.status === 'generating_outline' || session.status === 'expanding';
}
