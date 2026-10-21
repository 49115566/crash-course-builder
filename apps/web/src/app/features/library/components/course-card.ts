import { CdkMenuModule } from '@angular/cdk/menu';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CourseSummary } from '@ccb/contracts';

@Component({
  selector: 'ccb-course-card',
  imports: [CdkMenuModule, DatePipe, RouterLink],
  template: `
    <article class="course-card">
      <div class="course-card__top">
        <div class="course-card__headline">
          <p class="course-card__topic">{{ course().topic }}</p>
          <h3 class="course-card__title">
            <a [routerLink]="['/courses', course().id]">{{ course().title }}</a>
          </h3>
        </div>

        <button
          type="button"
          class="course-card__menu-button"
          [cdkMenuTriggerFor]="courseMenu"
          [attr.aria-label]="'Actions for ' + course().title"
          aria-haspopup="menu"
        >
          <span aria-hidden="true">•••</span>
        </button>

        <ng-template #courseMenu>
          <div class="ccb-menu" cdkMenu>
            <a class="ccb-menu__item" cdkMenuItem [routerLink]="['/courses', course().id]">
              Open course
            </a>
            <button type="button" class="ccb-menu__item" cdkMenuItem (click)="move.emit(course())">
              Move to another subject…
            </button>
            <button
              type="button"
              class="ccb-menu__item ccb-menu__item--danger"
              cdkMenuItem
              (click)="remove.emit(course())"
            >
              Delete course…
            </button>
          </div>
        </ng-template>
      </div>

      <p class="course-card__audience">{{ course().audience }}</p>

      <dl class="course-card__stats">
        <div>
          <dt>Reading time</dt>
          <dd>{{ course().stats.readingMinutes }} min</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{{ course().updatedAt | date: 'MMM d, y' }}</dd>
        </div>
      </dl>
    </article>
  `,
  styleUrl: './course-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseCard {
  readonly course = input.required<CourseSummary>();
  readonly move = output<CourseSummary>();
  readonly remove = output<CourseSummary>();
}
