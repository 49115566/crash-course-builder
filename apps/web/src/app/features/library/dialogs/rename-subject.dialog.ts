import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { libraryNameValidator } from '../library-name.validator';

export interface RenameSubjectDialogData {
  name: string;
}

@Component({
  selector: 'ccb-rename-subject-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <form class="ccb-dialog" (submit)="submit($event)">
      <header class="ccb-dialog__header">
        <p class="ccb-eyebrow">Organize your shelf</p>
        <h2 class="ccb-dialog__title">Rename subject</h2>
        <p class="ccb-dialog__body">
          The folder on this computer will be renamed. Courses inside it stay exactly where they
          are, with their files intact.
        </p>
      </header>

      <div class="ccb-field">
        <label for="rename-subject-name">Subject name</label>
        <input
          id="rename-subject-name"
          type="text"
          autocomplete="off"
          [formControl]="name"
          [attr.aria-invalid]="name.invalid && name.touched"
          [attr.aria-describedby]="name.invalid && name.touched ? 'rename-subject-error' : null"
        />
        @if (name.invalid && name.touched) {
          <p id="rename-subject-error" class="ccb-field__error">{{ nameError() }}</p>
        }
      </div>

      <footer class="ccb-dialog__actions">
        <button type="button" class="ccb-button ccb-button--ghost" (click)="cancel()">
          Cancel
        </button>
        <button type="submit" class="ccb-button ccb-button--primary" [disabled]="name.invalid">
          Rename subject
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenameSubjectDialog {
  protected readonly data = inject<RenameSubjectDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<string | undefined>>(DialogRef);
  protected readonly name = new FormControl(this.data.name, {
    nonNullable: true,
    validators: [Validators.required, libraryNameValidator],
  });

  protected nameError(): string {
    return (this.name.getError('libraryName') as string | undefined) ?? 'Enter a valid name.';
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.name.markAsTouched();
    if (this.name.invalid) {
      return;
    }

    this.dialogRef.close(this.name.value.trim());
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
