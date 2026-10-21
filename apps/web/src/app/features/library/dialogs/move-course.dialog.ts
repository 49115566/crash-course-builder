import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { CourseSummary, SubjectSummary } from '@ccb/contracts';

import { libraryNameError } from '../library-name.validator';

export interface MoveCourseDialogData {
  course: CourseSummary;
  subjects: SubjectSummary[];
}

export type MoveCourseDialogResult =
  { kind: 'existing'; subjectId: string } | { kind: 'new'; name: string };

@Component({
  selector: 'ccb-move-course-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <form class="ccb-dialog" (submit)="submit($event)">
      <header class="ccb-dialog__header">
        <p class="ccb-eyebrow">Organize your shelf</p>
        <h2 class="ccb-dialog__title">Move “{{ data.course.title }}”</h2>
        <p class="ccb-dialog__body">
          Choose another subject, or create one. The course folder moves with all of its files.
        </p>
      </header>

      <div class="ccb-field">
        <label for="move-course-subject">Destination</label>
        <select id="move-course-subject" [formControl]="choice">
          @for (subject of availableSubjects(); track subject.id) {
            <option [value]="subject.id">{{ subject.name }}</option>
          }
          <option value="__new__">Create a new subject…</option>
        </select>
      </div>

      @if (isNew()) {
        <div class="ccb-field">
          <label for="move-course-new-subject">New subject name</label>
          <input
            id="move-course-new-subject"
            type="text"
            autocomplete="off"
            [formControl]="newName"
            [attr.aria-invalid]="newName.touched && newNameError() !== null"
            [attr.aria-describedby]="
              newName.touched && newNameError() !== null ? 'move-course-new-subject-error' : null
            "
          />
          @if (newName.touched && newNameError(); as error) {
            <p id="move-course-new-subject-error" class="ccb-field__error">{{ error }}</p>
          }
        </div>
      }

      <footer class="ccb-dialog__actions">
        <button type="button" class="ccb-button ccb-button--ghost" (click)="cancel()">
          Cancel
        </button>
        <button type="submit" class="ccb-button ccb-button--primary" [disabled]="!canSubmit()">
          Move course
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoveCourseDialog {
  protected readonly data = inject<MoveCourseDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<MoveCourseDialogResult | undefined>>(DialogRef);

  protected readonly availableSubjects = computed(() =>
    this.data.subjects.filter((subject) => subject.id !== this.data.course.subjectId),
  );

  protected readonly choice = new FormControl(this.availableSubjects()[0]?.id ?? '__new__', {
    nonNullable: true,
  });
  protected readonly newName = new FormControl('', { nonNullable: true });
  private readonly selected = toSignal(this.choice.valueChanges, {
    initialValue: this.choice.value,
  });
  private readonly newNameValue = toSignal(this.newName.valueChanges, { initialValue: '' });

  protected readonly isNew = computed(() => this.selected() === '__new__');
  protected readonly newNameError = computed(() => {
    if (!this.isNew()) {
      return null;
    }
    return libraryNameError(this.newNameValue());
  });
  protected readonly canSubmit = computed(() => !this.isNew() || this.newNameError() === null);

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) {
      this.newName.markAsTouched();
      return;
    }

    if (this.isNew()) {
      this.dialogRef.close({ kind: 'new', name: this.newNameValue().trim() });
      return;
    }

    this.dialogRef.close({ kind: 'existing', subjectId: this.selected() });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
