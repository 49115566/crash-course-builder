import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, LibraryData, SubjectSummary } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToastService } from '../../shared/ui/toast/toast.service';
import { LibraryStore } from './library.store';

const SUBJECT_A: SubjectSummary = {
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

const SUBJECT_B: SubjectSummary = {
  id: '123e4567-e89b-42d3-a456-42661417400b',
  name: 'Marketing',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  courses: [],
};

const LIBRARY: LibraryData = {
  subjects: [SUBJECT_A, SUBJECT_B],
  totalCourses: 1,
};

describe('LibraryStore', () => {
  let store: LibraryStore;
  let http: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LibraryStore,
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(LibraryStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  async function loadLibrary(data: LibraryData = LIBRARY): Promise<void> {
    const promise = store.load();
    const request = http.expectOne('/api/library');
    request.flush({ data, requestId: 'request-1' } satisfies ApiSuccess<LibraryData>);
    await promise;
  }

  it('loads the library and stores scan warnings', async () => {
    const promise = store.load();
    http.expectOne('/api/library').flush({
      data: LIBRARY,
      warnings: [{ code: 'SUBJECT_ADOPTED', message: 'Adopted.' }],
      requestId: 'request-1',
    } satisfies ApiSuccess<LibraryData>);
    await promise;

    expect(store.status()).toBe('ready');
    expect(store.totalSubjects()).toBe(2);
    expect(store.totalCourses()).toBe(1);
    expect(store.warnings()).toHaveLength(1);
  });

  it('filters by course fields and by subject name', async () => {
    await loadLibrary();

    store.setSearchQuery('vector');
    expect(store.filteredSubjects().map((subject) => subject.id)).toEqual([SUBJECT_A.id]);
    expect(store.visibleCourseCount()).toBe(1);

    store.setSearchQuery('marketing');
    expect(store.filteredSubjects().map((subject) => subject.id)).toEqual([SUBJECT_B.id]);

    store.setSearchQuery('missing');
    expect(store.filteredSubjects()).toEqual([]);
  });

  it('creates a subject, refreshes, and reports success', async () => {
    await loadLibrary();
    const created = { ...SUBJECT_B, id: '123e4567-e89b-42d3-a456-42661417400c', name: 'Art' };
    const promise = store.createSubject('Art');

    const create = http.expectOne('/api/subjects');
    expect(create.request.method).toBe('POST');
    create.flush({
      data: { subject: created },
      requestId: 'request-1',
    } satisfies ApiSuccess<{ subject: SubjectSummary }>);
    await settle();

    const refresh = http.expectOne('/api/library');
    refresh.flush({
      data: { subjects: [...LIBRARY.subjects, created], totalCourses: 1 },
      requestId: 'request-2',
    } satisfies ApiSuccess<LibraryData>);

    await settle();
    await expect(promise).resolves.toEqual(created);
    expect(store.totalSubjects()).toBe(3);
    expect(toast.toasts().at(-1)?.message).toContain('Created');
  });

  it('keeps the previous order when reordering fails', async () => {
    await loadLibrary();
    const promise = store.reorderSubjects([SUBJECT_B.id, SUBJECT_A.id]);

    expect(store.subjects().map((subject) => subject.id)).toEqual([SUBJECT_B.id, SUBJECT_A.id]);

    http.expectOne('/api/subjects/order').flush(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The order could not be saved.',
          retryable: false,
          details: {},
        },
      },
      { status: 500, statusText: 'Server Error' },
    );
    await settle();

    await expect(promise).resolves.toBe(false);
    expect(store.subjects().map((subject) => subject.id)).toEqual([SUBJECT_A.id, SUBJECT_B.id]);
    expect(toast.toasts().at(-1)?.tone).toBe('error');
  });

  it('reloads when a reorder is stale', async () => {
    await loadLibrary();
    const promise = store.reorderSubjects([SUBJECT_B.id, SUBJECT_A.id]);

    http.expectOne('/api/subjects/order').flush(
      {
        error: {
          code: 'CONFLICT',
          message: 'The library changed.',
          retryable: false,
          details: { reason: 'stale_order' },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    const reload = http.expectOne('/api/library');
    reload.flush({ data: LIBRARY, requestId: 'request-2' } satisfies ApiSuccess<LibraryData>);

    await expect(promise).resolves.toBe(false);
    expect(store.subjects().map((subject) => subject.id)).toEqual([SUBJECT_A.id, SUBJECT_B.id]);
  });

  it('surfaces a retryable load error', async () => {
    const promise = store.load();
    http.expectOne('/api/library').flush('down', { status: 0, statusText: 'Unknown Error' });
    await promise;

    expect(store.status()).toBe('error');
    expect(store.error()?.code).toBe('NETWORK_ERROR');
  });

  it('deletes a subject with cascade options', async () => {
    await loadLibrary();
    const promise = store.deleteSubject(SUBJECT_A.id, {
      cascade: true,
      confirmName: 'Computer Science',
    });

    const request = http.expectOne(`/api/subjects/${SUBJECT_A.id}`);
    expect(request.request.body).toEqual({
      confirmed: true,
      cascade: true,
      confirmName: 'Computer Science',
    });
    request.flush({
      data: { deletedId: SUBJECT_A.id, deletedCourses: 1 },
      requestId: 'request-1',
    });
    await settle();

    const refresh = http.expectOne('/api/library');
    refresh.flush({
      data: { subjects: [SUBJECT_B], totalCourses: 0 },
      requestId: 'request-2',
    } satisfies ApiSuccess<LibraryData>);
    await settle();

    await expect(promise).resolves.toBe(true);
    expect(store.totalSubjects()).toBe(1);
  });
});
