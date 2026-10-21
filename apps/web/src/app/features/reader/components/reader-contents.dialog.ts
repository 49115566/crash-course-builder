import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import type { ReaderHeading } from '../markdown/course-document';
import { OutlineList } from './outline-list';

export interface ReaderContentsDialogData {
  headings: ReaderHeading[];
  activeId: string | null;
  readingMinutes: number;
}

@Component({
  selector: 'ccb-reader-contents-dialog',
  imports: [OutlineList],
  template: `
    <section class="contents-dialog" aria-labelledby="contents-dialog-title">
      <header class="contents-dialog__head">
        <div>
          <p class="ccb-eyebrow">In this course</p>
          <h2 id="contents-dialog-title">Course contents</h2>
          <p class="contents-dialog__meta">
            {{ data.headings.length }} sections · {{ data.readingMinutes }} min read
          </p>
        </div>
        <button
          type="button"
          class="contents-dialog__close"
          aria-label="Close course contents"
          (click)="close()"
        >
          ×
        </button>
      </header>

      <ccb-outline-list
        [headings]="data.headings"
        [activeId]="data.activeId"
        [compact]="true"
        (jump)="close($event)"
      />
    </section>
  `,
  styleUrl: './reader-contents.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderContentsDialog {
  protected readonly data = inject<ReaderContentsDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<string | undefined>);

  protected close(id?: string): void {
    this.dialogRef.close(id);
  }
}
