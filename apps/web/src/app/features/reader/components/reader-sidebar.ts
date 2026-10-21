import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ReaderHeading } from '../markdown/course-document';
import { OutlineList } from './outline-list';

@Component({
  selector: 'ccb-reader-sidebar',
  imports: [OutlineList],
  template: `
    <nav class="reader-sidebar" aria-label="Course contents">
      <div class="reader-sidebar__head">
        <p class="ccb-eyebrow">Contents</p>
        <p class="reader-sidebar__meta">{{ headings().length }} sections</p>
      </div>
      <ccb-outline-list
        [headings]="headings()"
        [activeId]="activeId()"
        [compact]="true"
        (jump)="jump.emit($event)"
      />
    </nav>
  `,
  styleUrl: './reader-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderSidebar {
  readonly headings = input.required<ReaderHeading[]>();
  readonly activeId = input<string | null>(null);
  readonly jump = output<string>();
}
