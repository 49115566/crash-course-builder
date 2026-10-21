import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, LibraryData } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryApiService } from './library-api.service';

const library: LibraryData = {
  subjects: [],
  totalCourses: 0,
};

describe('LibraryApiService', () => {
  let service: LibraryApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(LibraryApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('unwraps the library envelope and warnings', async () => {
    const promise = new Promise<{ data: LibraryData; warnings: unknown[] }>((resolve, reject) => {
      service.getLibrary().subscribe({ next: resolve, error: reject });
    });

    http.expectOne('/api/library').flush({
      data: library,
      warnings: [{ code: 'SUBJECT_ADOPTED', message: 'Adopted.' }],
      requestId: 'request-1',
    } satisfies ApiSuccess<LibraryData>);

    const result = await promise;
    expect(result.data).toEqual(library);
    expect(result.warnings).toHaveLength(1);
  });

  it('uses the expected methods and bodies for mutations', () => {
    service.createSubject('Math').subscribe();
    const create = http.expectOne('/api/subjects');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Math' });
    create.flush({
      data: { subject: subject() },
      requestId: 'request-1',
    });

    service.reorderSubjects([subject().id]).subscribe();
    const reorder = http.expectOne('/api/subjects/order');
    expect(reorder.request.method).toBe('PUT');
    expect(reorder.request.body).toEqual({ subjectIds: [subject().id] });
    reorder.flush({ data: { subjectIds: [subject().id] }, requestId: 'request-1' });

    const courseId = subject().courses[0]?.id ?? 'course-1';
    service.deleteCourse(courseId).subscribe();
    const removeCourse = http.expectOne(`/api/courses/${courseId}`);
    expect(removeCourse.request.method).toBe('DELETE');
    expect(removeCourse.request.body).toEqual({ confirmed: true });
    removeCourse.flush({
      data: { deletedId: courseId },
      requestId: 'request-1',
    });

    service.deleteSubject(subject().id, { cascade: true, confirmName: 'Math' }).subscribe();
    const removeSubject = http.expectOne(`/api/subjects/${subject().id}`);
    expect(removeSubject.request.method).toBe('DELETE');
    expect(removeSubject.request.body).toEqual({
      confirmed: true,
      cascade: true,
      confirmName: 'Math',
    });
    removeSubject.flush({
      data: { deletedId: subject().id, deletedCourses: 1 },
      requestId: 'request-1',
    });
  });

  it('maps the API error envelope into a client error', async () => {
    const promise = new Promise<unknown>((resolve) => {
      service.getLibrary().subscribe({
        next: resolve,
        error: (error: unknown) => {
          resolve(error);
        },
      });
    });

    http.expectOne('/api/library').flush(
      {
        error: {
          code: 'LIBRARY_UNAVAILABLE',
          message: 'The library is unavailable.',
          retryable: true,
          details: {},
        },
      },
      { status: 503, statusText: 'Service Unavailable' },
    );

    const error = await promise;
    expect(error).toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      message: 'The library is unavailable.',
      retryable: true,
      status: 503,
    });
  });
});

function subject() {
  return {
    id: '123e4567-e89b-42d3-a456-42661417400a',
    name: 'Math',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    courses: [
      {
        id: '123e4567-e89b-42d3-a456-426614174010',
        subjectId: '123e4567-e89b-42d3-a456-42661417400a',
        topic: 'Algebra',
        title: 'Algebra in 30 Minutes',
        audience: 'curious adults',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        status: 'complete' as const,
        stats: { sections: 5, words: 4000, readingMinutes: 18 },
      },
    ],
  };
}
