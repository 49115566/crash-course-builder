import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import type { SubjectSummary } from '@ccb/contracts';

export interface DeleteSubjectDialogData {
  subject: SubjectSummary;
}

@Component({
  selector: 'ccb-delete-subject-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <div class="ccb-dialog">
      <header class="ccb-dialog__header">
        <p class="ccb-eyebrow ccb-eyebrow--danger">Remove from library</p>
        <h2 class="ccb-dialog__title">Delete “{{ data.subject.name }}”?</h2>
        @if (courseCount() > 0) {
          <p class="ccb-dialog__body">
            This subject contains
            <strong>{{ courseCount() }} course{{ courseCount() === 1 ? '' : 's' }}</strong>
            and every file inside will be removed. This cannot be undone.
          </p>
        } @else {
          <p class="ccb-dialog__body">
            This removes the empty subject folder from this computer. This cannot be undone.
          </p>
        }
      </header>

      @if (courseCount() > 0) {
        <div class="ccb-field">
          <label for="delete-subject-confirm">
            Type <strong>{{ data.subject.name }}</strong> to confirm
          </label>
          <input
            id="delete-subject-confirm"
            type="text"
            autocomplete="off"
            [formControl]="confirmation"
            [attr.aria-invalid]="!matches()"
          />
        </div>
      }

      <footer class="ccb-dialog__actions">
        <button type="button" class="ccb-button ccb-button--ghost" (click)="cancel()">
          Keep subject
        </button>
        <button
          type="button"
          class="ccb-button ccb-button--danger"
          [disabled]="!canDelete()"
          (click)="confirm()"
        >
          Delete subject
        </button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteSubjectDialog {
  protected readonly data = inject<DeleteSubjectDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<boolean | undefined>>(DialogRef);
  protected readonly courseCount = computed(() => this.data.subject.courses.length);
  protected readonly confirmation = new FormControl('', { nonNullable: true });
  private readonly confirmationValue = toSignal(this.confirmation.valueChanges, {
    initialValue: '',
  });
  protected readonly matches = computed(
    () => this.confirmationValue().trim() === this.data.subject.name,
  );
  protected readonly canDelete = computed(() => this.courseCount() === 0 || this.matches());
  private readonly submitted = signal(false);

  protected confirm(): void {
    if (!this.canDelete() || this.submitted()) {
      return;
    }
    this.submitted.set(true);
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
