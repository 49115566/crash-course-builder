import { Dialog, DialogModule } from '@angular/cdk/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, LibraryData, SubjectSummary } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryHomePage } from './library-home.page';

const SUBJECT: SubjectSummary = {
  id: '123e4567-e89b-42d3-a456-42661417400a',
  name: 'Computer Science',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  courses: [
    {
      id: '123e4567-e89b-42d3-a456-426614174010',
      subjectId: '123e4567-e89b-42d3-a456-42661417400a',
      topic: 'Vector Databases',
      title: 'Vector Databases: A Crash Course',
      audience: 'software engineers',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      status: 'complete',
      stats: { sections: 7, words: 4820, readingMinutes: 22 },
    },
  ],
};

const POPULATED: LibraryData = { subjects: [SUBJECT], totalCourses: 1 };
const EMPTY: LibraryData = { subjects: [], totalCourses: 0 };

describe('LibraryHomePage', () => {
  let http: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<LibraryHomePage>>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LibraryHomePage, DialogModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Dialog), 'open');
    fixture = TestBed.createComponent(LibraryHomePage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  async function flushLibrary(data: LibraryData): Promise<void> {
    const request = http.expectOne('/api/library');
    request.flush({ data, requestId: 'request-1' } satisfies ApiSuccess<LibraryData>);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders the editorial empty state after loading', async () => {
    await flushLibrary(EMPTY);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('Your library');
    expect(element.textContent).toContain('Your shelf is empty');
    expect(element.textContent).toContain('0 subjects · 0 courses');
    expect(element.querySelector('ccb-library-skeleton')).toBeNull();
  });

  it('renders subjects and course metadata', async () => {
    await flushLibrary(POPULATED);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Computer Science');
    expect(element.textContent).toContain('Vector Databases: A Crash Course');
    expect(element.textContent).toContain('software engineers');
    expect(element.textContent).toContain('22 min');
    expect(element.textContent).toContain('1 subject · 1 course');
  });

  it('filters courses and shows a no-match state', async () => {
    await flushLibrary(POPULATED);
    const input = fixture.nativeElement.querySelector('#library-search') as HTMLInputElement;

    input.value = 'vector';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 of 1 courses');

    input.value = 'nothing matches';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No courses match');
  });

  it('creates a subject inline and refreshes the library', async () => {
    await flushLibrary(EMPTY);
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('#new-subject-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = element.querySelector('#new-subject-name') as HTMLInputElement;
    input.value = 'Art';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector('.library__create') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    const create = http.expectOne('/api/subjects');
    create.flush({
      data: {
        subject: {
          ...SUBJECT,
          id: '123e4567-e89b-42d3-a456-42661417400b',
          name: 'Art',
          courses: [],
        },
      },
      requestId: 'request-1',
    } satisfies ApiSuccess<{ subject: SubjectSummary }>);
    await fixture.whenStable();

    const refresh = http.expectOne('/api/library');
    refresh.flush({
      data: {
        subjects: [
          { ...SUBJECT, id: '123e4567-e89b-42d3-a456-42661417400b', name: 'Art', courses: [] },
        ],
        totalCourses: 0,
      },
      requestId: 'request-2',
    } satisfies ApiSuccess<LibraryData>);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Art');
    expect(fixture.nativeElement.querySelector('#new-subject-name')).toBeNull();
  });

  it('rejects an invalid subject name before contacting the server', async () => {
    await flushLibrary(EMPTY);
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('#new-subject-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = element.querySelector('#new-subject-name') as HTMLInputElement;
    input.value = 'CON';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector('.library__create') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(element.textContent).toContain('reserved by Windows');
    http.expectNone('/api/subjects');
  });

  it('shows scan warnings and allows dismissing them', async () => {
    const request = http.expectOne('/api/library');
    request.flush({
      data: POPULATED,
      warnings: [{ code: 'SUBJECT_ADOPTED', message: 'A subject was adopted.' }],
      requestId: 'request-1',
    } satisfies ApiSuccess<LibraryData>);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Library needed a few repairs');

    (fixture.nativeElement.querySelector('.warnings__dismiss') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Library needed a few repairs');
  });

  it('renders a retryable error state', async () => {
    http.expectOne('/api/library').flush(
      {
        error: {
          code: 'LIBRARY_UNAVAILABLE',
          message: 'The library folder could not be read.',
          retryable: true,
          details: {},
        },
      },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('We could not read your shelves');
    expect(fixture.nativeElement.textContent).toContain('library folder could not be read');

    (fixture.nativeElement.querySelector('.library__error button') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/library').flush({
      data: EMPTY,
      requestId: 'request-2',
    } satisfies ApiSuccess<LibraryData>);
  });
});
