import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ReaderHeading } from '../markdown/course-document';
import { OutlineList } from './outline-list';

@Component({
  selector: 'ccb-course-outline-card',
  imports: [OutlineList],
  template: `
    <nav class="outline-card" aria-labelledby="course-outline-title">
      <div class="outline-card__head">
        <div>
          <p class="ccb-eyebrow">In this course</p>
          <h2 id="course-outline-title">What you will learn</h2>
        </div>
        <p class="outline-card__meta">
          {{ headings().length }} sections · {{ readingMinutes() }} min read
        </p>
      </div>

      <ccb-outline-list
        [headings]="headings()"
        [activeId]="activeId()"
        (jump)="jump.emit($event)"
      />

      @if (headings().length === 0) {
        <p class="outline-card__empty">
          This course file has no section headings, so there is no clickable outline. The full
          document is still shown below.
        </p>
      }
    </nav>
  `,
  styleUrl: './course-outline-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseOutlineCard {
  readonly headings = input.required<ReaderHeading[]>();
  readonly activeId = input<string | null>(null);
  readonly readingMinutes = input.required<number>();
  readonly jump = output<string>();
}
