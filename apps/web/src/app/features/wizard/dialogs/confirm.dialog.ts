import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

export interface ConfirmDialogData {
  eyebrow?: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

@Component({
  selector: 'ccb-confirm-dialog',
  template: `
    <div class="ccb-dialog" role="document">
      <header class="ccb-dialog__header">
        @if (data.eyebrow; as eyebrow) {
          <p class="ccb-eyebrow" [class.ccb-eyebrow--danger]="data.tone === 'danger'">
            {{ eyebrow }}
          </p>
        }
        <h2 class="ccb-dialog__title">{{ data.title }}</h2>
        <p class="ccb-dialog__body">{{ data.body }}</p>
      </header>

      <footer class="ccb-dialog__actions">
        <button type="button" class="ccb-button ccb-button--ghost" (click)="cancel()">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          type="button"
          class="ccb-button"
          [class.ccb-button--danger]="data.tone === 'danger'"
          [class.ccb-button--primary]="data.tone !== 'danger'"
          (click)="confirm()"
        >
          {{ data.confirmLabel }}
        </button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<boolean | undefined>>(DialogRef);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
