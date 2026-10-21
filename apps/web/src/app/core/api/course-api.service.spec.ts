import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, CourseDetail } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CourseApiService } from './course-api.service';

const course: CourseDetail = {
  meta: {
    schemaVersion: 1,
    id: '123e4567-e89b-42d3-a456-426614174010',
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
  outlineMarkdown: '# Vector Databases\n',
  courseMarkdown: '# Vector Databases\n\n## 1. Foundations\n',
};

describe('CourseApiService', () => {
  let service: CourseApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CourseApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('unwraps a course detail envelope', async () => {
    const promise = new Promise<CourseDetail>((resolve, reject) => {
      service.getCourse(course.meta.id).subscribe({ next: resolve, error: reject });
    });

    http.expectOne(`/api/courses/${course.meta.id}`).flush({
      data: course,
      requestId: 'request-1',
    } satisfies ApiSuccess<CourseDetail>);

    await expect(promise).resolves.toEqual(course);
  });

  it('maps the error envelope into a client error', async () => {
    const promise = new Promise<unknown>((resolve) => {
      service.getCourse(course.meta.id).subscribe({
        next: resolve,
        error: (error: unknown) => resolve(error),
      });
    });

    http.expectOne(`/api/courses/${course.meta.id}`).flush(
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

    await expect(promise).resolves.toMatchObject({
      code: 'NOT_FOUND',
      message: 'The course could not be found.',
      status: 404,
    });
  });
});
