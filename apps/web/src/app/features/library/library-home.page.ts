import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Dialog } from '@angular/cdk/dialog';
import { DragDropModule, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  HostListener,
  type Type,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { CourseSummary, SessionSummary, SubjectSummary } from '@ccb/contracts';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { BadgeDirective } from '../../shared/ui/badge/badge.directive';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { LibraryWarnings } from './components/library-warnings';
import { LibrarySkeleton } from './components/library-skeleton';
import { InProgressStrip } from './components/in-progress-strip';
import { SubjectSection, type SubjectMoveDirection } from './components/subject-section';
import { DeleteCourseDialog, type DeleteCourseDialogData } from './dialogs/delete-course.dialog';
import { DeleteSubjectDialog, type DeleteSubjectDialogData } from './dialogs/delete-subject.dialog';
import {
  DiscardSessionDialog,
  type DiscardSessionDialogData,
} from './dialogs/discard-session.dialog';
import {
  MoveCourseDialog,
  type MoveCourseDialogData,
  type MoveCourseDialogResult,
} from './dialogs/move-course.dialog';
import { RenameSubjectDialog, type RenameSubjectDialogData } from './dialogs/rename-subject.dialog';
import { libraryNameValidator } from './library-name.validator';
import { ActiveSessionsStore } from './active-sessions.store';
import { LibraryStore } from './library.store';

@Component({
  selector: 'ccb-library-home',
  imports: [
    BadgeDirective,
    ButtonDirective,
    DragDropModule,
    EmptyState,
    InProgressStrip,
    LibrarySkeleton,
    LibraryWarnings,
    ReactiveFormsModule,
    RouterLink,
    SubjectSection,
  ],
  templateUrl: './library-home.page.html',
  styleUrl: './library-home.page.scss',
  providers: [ActiveSessionsStore, LibraryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryHomePage {
  private readonly dialog = inject(Dialog);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly store = inject(LibraryStore);
  protected readonly sessions = inject(ActiveSessionsStore);
  private readonly createInput = viewChild<ElementRef<HTMLInputElement>>('createInput');

  protected readonly showCreate = signal(false);
  protected readonly creating = signal(false);
  protected readonly createName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, libraryNameValidator],
  });

  protected readonly reorderDisabled = computed(
    () => this.store.isSearching() || this.store.busy(),
  );
  protected readonly summary = computed(() => {
    if (this.store.status() === 'loading' && !this.store.hasContent()) {
      return 'Reading your shelves…';
    }

    const subjects = this.store.totalSubjects();
    const courses = this.store.totalCourses();
    return `${String(subjects)} subject${subjects === 1 ? '' : 's'} · ${String(courses)} course${courses === 1 ? '' : 's'}`;
  });

  constructor() {
    void this.store.load();
    void this.sessions.load();
  }

  @HostListener('window:focus')
  protected onWindowFocus(): void {
    if (document.visibilityState === 'visible') {
      void this.sessions.load({ silent: true });
    }
  }

  protected onSearch(event: Event): void {
    this.store.setSearchQuery((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.store.setSearchQuery('');
    setTimeout(() => document.getElementById('library-search')?.focus(), 0);
  }

  protected startCreate(): void {
    this.createName.reset('');
    this.showCreate.set(true);
    setTimeout(() => this.createInput()?.nativeElement.focus(), 0);
  }

  protected cancelCreate(): void {
    this.showCreate.set(false);
    this.createName.reset('');
  }

  protected createError(): string {
    return (
      (this.createName.getError('libraryName') as string | undefined) ?? 'Enter a subject name.'
    );
  }

  protected async submitCreate(event: Event): Promise<void> {
    event.preventDefault();
    this.createName.markAsTouched();
    if (this.createName.invalid || this.creating()) {
      return;
    }

    this.creating.set(true);
    try {
      const subject = await this.store.createSubject(this.createName.value);
      if (subject !== null) {
        this.cancelCreate();
        this.store.setSearchQuery('');
        setTimeout(() => this.focusSubject(subject.id), 0);
      }
    } finally {
      this.creating.set(false);
    }
  }

  protected async renameSubject(subject: SubjectSummary): Promise<void> {
    const name = await this.openDialog<string, RenameSubjectDialogData>(
      RenameSubjectDialog,
      { name: subject.name },
      'Rename subject',
    );

    if (name === undefined || name.trim() === subject.name) {
      return;
    }

    const renamed = await this.store.renameSubject(subject.id, name);
    if (renamed !== null) {
      setTimeout(() => this.focusSubject(renamed.id), 0);
    }
  }

  protected async deleteSubject(subject: SubjectSummary): Promise<void> {
    const confirmed = await this.openDialog<boolean, DeleteSubjectDialogData>(
      DeleteSubjectDialog,
      { subject },
      `Delete ${subject.name}`,
    );

    if (confirmed !== true) {
      return;
    }

    await this.store.deleteSubject(subject.id, {
      cascade: subject.courses.length > 0,
      ...(subject.courses.length > 0 ? { confirmName: subject.name } : {}),
    });
    setTimeout(() => this.focusAfterRemoval(), 0);
  }

  protected async moveCourse(course: CourseSummary): Promise<void> {
    const result = await this.openDialog<MoveCourseDialogResult, MoveCourseDialogData>(
      MoveCourseDialog,
      { course, subjects: this.store.subjects() },
      `Move ${course.title}`,
    );

    if (result === undefined) {
      return;
    }

    if (result.kind === 'existing') {
      await this.store.moveCourse(course.id, result.subjectId);
      return;
    }

    await this.store.moveCourseToNewSubject(course.id, result.name);
  }

  protected async discardSession(session: SessionSummary): Promise<void> {
    const confirmed = await this.openDialog<boolean, DiscardSessionDialogData>(
      DiscardSessionDialog,
      { session },
      `Discard ${session.title ?? session.topic}`,
    );

    if (confirmed === true) {
      await this.sessions.discard(session.id);
    }
  }

  protected async deleteCourse(course: CourseSummary): Promise<void> {
    const confirmed = await this.openDialog<boolean, DeleteCourseDialogData>(
      DeleteCourseDialog,
      { course },
      `Delete ${course.title}`,
    );

    if (confirmed === true) {
      const removed = await this.store.deleteCourse(course.id);
      if (removed) {
        setTimeout(() => this.focusSubject(course.subjectId), 0);
      }
    }
  }

  protected async moveSubject(event: {
    id: string;
    direction: SubjectMoveDirection;
  }): Promise<void> {
    if (this.reorderDisabled()) {
      return;
    }

    const subjects = [...this.store.subjects()];
    const currentIndex = subjects.findIndex((subject) => subject.id === event.id);
    const targetIndex = event.direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= subjects.length) {
      return;
    }

    const [moved] = subjects.splice(currentIndex, 1);
    if (moved === undefined) {
      return;
    }
    subjects.splice(targetIndex, 0, moved);

    const saved = await this.store.reorderSubjects(subjects.map((subject) => subject.id));
    if (saved) {
      void this.announcer.announce(
        `Moved ${moved.name} to position ${String(targetIndex + 1)} of ${String(subjects.length)}.`,
        'polite',
      );
      setTimeout(() => this.focusSubject(moved.id), 0);
    }
  }

  protected async dropSubject(event: CdkDragDrop<SubjectSummary[]>): Promise<void> {
    if (this.reorderDisabled() || event.previousIndex === event.currentIndex) {
      return;
    }

    const subjects = [...this.store.subjects()];
    moveItemInArray(subjects, event.previousIndex, event.currentIndex);
    const moved = subjects[event.currentIndex];

    const saved = await this.store.reorderSubjects(subjects.map((subject) => subject.id));
    if (saved && moved !== undefined) {
      void this.announcer.announce(
        `Moved ${moved.name} to position ${String(event.currentIndex + 1)} of ${String(subjects.length)}.`,
        'polite',
      );
    }
  }

  protected reload(): void {
    void this.store.load();
  }

  private focusSubject(id: string): void {
    document.getElementById(`subject-${id}`)?.focus();
  }

  private focusAfterRemoval(): void {
    const firstSubject = this.store.subjects()[0];
    if (firstSubject !== undefined) {
      this.focusSubject(firstSubject.id);
      return;
    }
    document.getElementById('new-subject-button')?.focus();
  }

  private async openDialog<Result, Data>(
    component: Type<unknown>,
    data: Data,
    ariaLabel: string,
  ): Promise<Result | undefined> {
    const reference = this.dialog.open<Result, Data>(component, {
      data,
      ariaLabel,
      panelClass: 'ccb-dialog-panel',
      backdropClass: 'ccb-dialog-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });

    return firstValueFrom(reference.closed);
  }
}
