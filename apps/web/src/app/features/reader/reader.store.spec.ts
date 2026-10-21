import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import type { ApiSuccess, CourseDetail } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReaderStore } from './reader.store';

const COURSE_ID = '123e4567-e89b-42d3-a456-426614174010';
const OTHER_ID = '123e4567-e89b-42d3-a456-426614174011';

function course(id = COURSE_ID): CourseDetail {
  return {
    meta: {
      schemaVersion: 1,
      id,
      subject: {
        id: '123e4567-e89b-42d3-a456-42661417400a',
        name: 'Computer Science',
      },
      topic: 'Vector Databases',
      title: 'Vector Databases: A Crash Course',
      audience: 'software engineers',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      status: 'complete',
      ai: { provider: 'deepseek', model: 'deepseek-chat' },
      promptVersion: '1',
      stats: { sections: 2, words: 1200, readingMinutes: 6 },
    },
    outlineMarkdown: '# Outline\n',
    courseMarkdown: '# Vector Databases\n\n## 1. Foundations\n',
  };
}

describe('ReaderStore', () => {
  let store: ReaderStore;
  let http: HttpTestingController;
  let title: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReaderStore,
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(ReaderStore);
    http = TestBed.inject(HttpTestingController);
    title = TestBed.inject(Title);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('loads a course and sets a descriptive document title', async () => {
    const loading = store.load(COURSE_ID);

    expect(store.status()).toBe('loading');
    http.expectOne(`/api/courses/${COURSE_ID}`).flush({
      data: course(),
      requestId: 'request-1',
    } satisfies ApiSuccess<CourseDetail>);
    await loading;

    expect(store.status()).toBe('ready');
    expect(store.course()?.meta.id).toBe(COURSE_ID);
    expect(title.getTitle()).toBe('Vector Databases: A Crash Course — Crash Course Builder');
  });

  it('shows a not-found error and supports retry', async () => {
    const loading = store.load(COURSE_ID);
    http.expectOne(`/api/courses/${COURSE_ID}`).flush(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'The course could not be found.',
          retryable: false,
          details: {},
        },
      },
      { status: 404, statusText: 'Not Found' },
    );
    await loading;

    expect(store.status()).toBe('error');
    expect(store.error()?.code).toBe('NOT_FOUND');
    expect(title.getTitle()).toBe('Course unavailable — Crash Course Builder');

    const retry = store.retry();
    http.expectOne(`/api/courses/${COURSE_ID}`).flush({
      data: course(),
      requestId: 'request-2',
    } satisfies ApiSuccess<CourseDetail>);
    await retry;

    expect(store.status()).toBe('ready');
    expect(store.course()?.meta.id).toBe(COURSE_ID);
  });

  it('ignores a stale response when the route changes quickly', async () => {
    const first = store.load(COURSE_ID);
    const second = store.load(OTHER_ID);

    http.expectOne(`/api/courses/${OTHER_ID}`).flush({
      data: course(OTHER_ID),
      requestId: 'request-2',
    } satisfies ApiSuccess<CourseDetail>);
    await second;

    http.expectOne(`/api/courses/${COURSE_ID}`).flush({
      data: course(COURSE_ID),
      requestId: 'request-1',
    } satisfies ApiSuccess<CourseDetail>);
    await first;

    expect(store.course()?.meta.id).toBe(OTHER_ID);
  });
});
