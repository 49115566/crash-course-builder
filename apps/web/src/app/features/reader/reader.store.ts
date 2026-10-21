import { Injectable, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import type { CourseDetail } from '@ccb/contracts';
import { firstValueFrom } from 'rxjs';

import type { ApiClientError } from '../../core/api/api-error';
import { CourseApiService } from '../../core/api/course-api.service';

type ReaderStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ReaderState {
  status: ReaderStatus;
  course: CourseDetail | null;
  error: ApiClientError | null;
}

function asClientError(error: unknown): ApiClientError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return error as ApiClientError;
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Something unexpected happened while opening this course.',
    retryable: false,
    details: {},
    status: null,
  };
}

@Injectable()
export class ReaderStore {
  private readonly api = inject(CourseApiService);
  private readonly title = inject(Title);
  private readonly state = signal<ReaderState>({ status: 'idle', course: null, error: null });
  private sequence = 0;
  private currentId: string | null = null;

  readonly status = computed(() => this.state().status);
  readonly course = computed(() => this.state().course);
  readonly error = computed(() => this.state().error);

  async load(courseId: string): Promise<void> {
    this.currentId = courseId;
    const sequence = ++this.sequence;
    this.state.update((state) => ({
      status: 'loading',
      course: state.course?.meta.id === courseId ? state.course : null,
      error: null,
    }));

    try {
      const course = await firstValueFrom(this.api.getCourse(courseId));

      if (sequence !== this.sequence) {
        return;
      }

      this.state.set({ status: 'ready', course, error: null });
      this.title.setTitle(`${course.meta.title} — Crash Course Builder`);
    } catch (error) {
      if (sequence !== this.sequence) {
        return;
      }

      this.state.set({
        status: 'error',
        course: null,
        error: asClientError(error),
      });
      this.title.setTitle('Course unavailable — Crash Course Builder');
    }
  }

  async retry(): Promise<void> {
    if (this.currentId !== null) {
      await this.load(this.currentId);
    }
  }
}
