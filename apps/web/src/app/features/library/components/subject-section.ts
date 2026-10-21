import { CdkMenuModule } from '@angular/cdk/menu';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CourseSummary, SubjectSummary } from '@ccb/contracts';

import { CourseCard } from './course-card';

export type SubjectMoveDirection = 'up' | 'down';

@Component({
  selector: 'ccb-subject-section',
  imports: [CdkMenuModule, DragDropModule, CourseCard],
  template: `
    <section class="subject" cdkDrag [cdkDragData]="subject()">
      <header class="subject__header">
        <span
          class="subject__drag-handle"
          cdkDragHandle
          aria-hidden="true"
          title="Drag to reorder. Keyboard users can use the subject menu."
        >
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </span>

        <div class="subject__heading">
          <h2 class="subject__title" [id]="'subject-' + subject().id" tabindex="-1">
            {{ subject().name }}
          </h2>
          <p class="subject__count">
            {{ subject().courses.length }}
            {{ subject().courses.length === 1 ? 'course' : 'courses' }}
          </p>
        </div>

        <button
          type="button"
          class="subject__menu-button"
          [cdkMenuTriggerFor]="subjectMenu"
          [attr.aria-label]="'Actions for ' + subject().name"
          aria-haspopup="menu"
        >
          <span aria-hidden="true">•••</span>
        </button>

        <ng-template #subjectMenu>
          <div class="ccb-menu" cdkMenu>
            <button
              type="button"
              class="ccb-menu__item"
              cdkMenuItem
              (click)="rename.emit(subject())"
            >
              Rename subject…
            </button>
            <button
              type="button"
              class="ccb-menu__item"
              cdkMenuItem
              [disabled]="reorderDisabled() || index() === 0"
              (click)="moveSubject.emit({ id: subject().id, direction: 'up' })"
            >
              Move up
            </button>
            <button
              type="button"
              class="ccb-menu__item"
              cdkMenuItem
              [disabled]="reorderDisabled() || index() === total() - 1"
              (click)="moveSubject.emit({ id: subject().id, direction: 'down' })"
            >
              Move down
            </button>
            <div class="ccb-menu__separator" role="separator"></div>
            <button
              type="button"
              class="ccb-menu__item ccb-menu__item--danger"
              cdkMenuItem
              (click)="deleteSubject.emit(subject())"
            >
              Delete subject…
            </button>
          </div>
        </ng-template>
      </header>

      @if (subject().courses.length > 0) {
        <div class="subject__courses">
          @for (course of subject().courses; track course.id) {
            <ccb-course-card
              [course]="course"
              (move)="moveCourse.emit($event)"
              (remove)="deleteCourse.emit($event)"
            />
          }
        </div>
      } @else {
        <p class="subject__empty">
          No courses yet. Course folders saved in <span>{{ subject().name }}</span> will appear
          here.
        </p>
      }
    </section>
  `,
  styleUrl: './subject-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectSection {
  readonly subject = input.required<SubjectSummary>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();
  readonly reorderDisabled = input(false);

  readonly rename = output<SubjectSummary>();
  readonly deleteSubject = output<SubjectSummary>();
  readonly moveSubject = output<{ id: string; direction: SubjectMoveDirection }>();
  readonly moveCourse = output<CourseSummary>();
  readonly deleteCourse = output<CourseSummary>();
}
