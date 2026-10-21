import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CourseSummary, SubjectSummary } from '@ccb/contracts';
import { describe, expect, it, vi } from 'vitest';

import { DeleteCourseDialog, type DeleteCourseDialogData } from './delete-course.dialog';
import { DeleteSubjectDialog, type DeleteSubjectDialogData } from './delete-subject.dialog';
import { MoveCourseDialog, type MoveCourseDialogData } from './move-course.dialog';
import { RenameSubjectDialog, type RenameSubjectDialogData } from './rename-subject.dialog';

const SUBJECT: SubjectSummary = {
  id: '123e4567-e89b-42d3-a456-42661417400a',
  name: 'Math',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  courses: [],
};

const COURSE: CourseSummary = {
  id: '123e4567-e89b-42d3-a456-426614174010',
  subjectId: SUBJECT.id,
  topic: 'Algebra',
  title: 'Algebra in 30 Minutes',
  audience: 'curious adults',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  status: 'complete',
  stats: { sections: 5, words: 4000, readingMinutes: 18 },
};

function setup<T>(
  component: Type<T>,
  data: unknown,
): { fixture: ReturnType<typeof TestBed.createComponent<T>>; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [component],
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, close };
}

describe('library dialogs', () => {
  it('renames a subject after client validation', () => {
    const { fixture, close } = setup<RenameSubjectDialog>(RenameSubjectDialog, {
      name: 'Math',
    } satisfies RenameSubjectDialogData);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'CON';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    expect(close).not.toHaveBeenCalled();

    input.value = '  Advanced Math  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    expect(close).toHaveBeenCalledWith('Advanced Math');
  });

  it('confirms a course deletion', () => {
    const { fixture, close } = setup<DeleteCourseDialog>(DeleteCourseDialog, {
      course: COURSE,
    } satisfies DeleteCourseDialogData);

    (fixture.nativeElement.querySelector('.ccb-button--danger') as HTMLButtonElement).click();

    expect(close).toHaveBeenCalledWith(true);
  });

  it('requires the exact subject name when courses are present', () => {
    const subject = { ...SUBJECT, courses: [COURSE] };
    const { fixture, close } = setup<DeleteSubjectDialog>(DeleteSubjectDialog, {
      subject,
    } satisfies DeleteSubjectDialogData);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const confirm = fixture.nativeElement.querySelector('.ccb-button--danger') as HTMLButtonElement;

    expect(confirm.disabled).toBe(true);
    input.value = 'Wrong';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(true);

    input.value = 'Math';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('moves a course to an existing subject', () => {
    const other = {
      ...SUBJECT,
      id: '123e4567-e89b-42d3-a456-42661417400b',
      name: 'Science',
    };
    const { fixture, close } = setup<MoveCourseDialog>(MoveCourseDialog, {
      course: COURSE,
      subjects: [SUBJECT, other],
    } satisfies MoveCourseDialogData);

    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );

    expect(close).toHaveBeenCalledWith({ kind: 'existing', subjectId: other.id });
  });

  it('validates a new subject name when moving a course', () => {
    const { fixture, close } = setup<MoveCourseDialog>(MoveCourseDialog, {
      course: COURSE,
      subjects: [SUBJECT],
    } satisfies MoveCourseDialogData);
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(select.value).toBe('__new__');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    expect(close).not.toHaveBeenCalled();

    input.value = 'Art';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    expect(close).toHaveBeenCalledWith({ kind: 'new', name: 'Art' });
  });
});
