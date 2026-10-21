import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { CourseSummary } from '@ccb/contracts';

export interface DeleteCourseDialogData {
  course: CourseSummary;
}

@Component({
  selector: 'ccb-delete-course-dialog',
  template: `
    <div class="ccb-dialog">
      <header class="ccb-dialog__header">
        <p class="ccb-eyebrow ccb-eyebrow--danger">Remove from library</p>
        <h2 class="ccb-dialog__title">Delete “{{ data.course.title }}”?</h2>
        <p class="ccb-dialog__body">
          This removes the course folder and its Markdown files from this computer. This cannot be
          undone.
        </p>
      </header>

      <div class="ccb-dialog__note">
        <span class="ccb-dialog__note-label">Folder</span>
        <span>{{ data.course.topic }}</span>
      </div>

      <footer class="ccb-dialog__actions">
        <button type="button" class="ccb-button ccb-button--ghost" (click)="cancel()">
          Keep course
        </button>
        <button type="button" class="ccb-button ccb-button--danger" (click)="confirm()">
          Delete course
        </button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteCourseDialog {
  protected readonly data = inject<DeleteCourseDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<boolean | undefined>>(DialogRef);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
