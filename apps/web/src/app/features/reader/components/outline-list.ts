import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ReaderHeading } from '../markdown/course-document';

@Component({
  selector: 'ccb-outline-list',
  template: `
    <ol class="outline-list" [class.outline-list--compact]="compact()">
      @for (heading of headings(); track heading.id) {
        <li>
          <a
            class="outline-list__link"
            [href]="'#' + heading.id"
            [class.is-active]="heading.id === activeId()"
            [attr.aria-current]="heading.id === activeId() ? 'location' : null"
            (click)="activate($event, heading.id)"
          >
            <span class="outline-list__number" aria-hidden="true">{{
              heading.number ?? $index + 1
            }}</span>
            <span class="outline-list__label">{{ heading.label }}</span>
          </a>
        </li>
      }
    </ol>
  `,
  styleUrl: './outline-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutlineList {
  readonly headings = input.required<ReaderHeading[]>();
  readonly activeId = input<string | null>(null);
  readonly compact = input(false);
  readonly jump = output<string>();

  protected activate(event: Event, id: string): void {
    event.preventDefault();
    this.jump.emit(id);
  }
}
