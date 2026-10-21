import { Injectable, computed, inject, signal } from '@angular/core';
import type { LibraryData, ScanWarning, SubjectSummary } from '@ccb/contracts';
import { firstValueFrom, type Observable } from 'rxjs';

import { LibraryApiService, type LibraryApiResult } from '../../core/api/library-api.service';
import type { ApiClientError } from '../../core/api/api-error';
import { ToastService } from '../../shared/ui/toast/toast.service';

type LibraryStatus = 'loading' | 'ready' | 'error';

interface LibraryState {
  status: LibraryStatus;
  data: LibraryData;
  warnings: ScanWarning[];
  error: ApiClientError | null;
}

const EMPTY_LIBRARY: LibraryData = { subjects: [], totalCourses: 0 };

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
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
    message: 'Something unexpected happened while updating the library.',
    retryable: false,
    details: {},
    status: null,
  };
}

function warningKey(warning: ScanWarning): string {
  return `${warning.code}:${warning.path ?? ''}:${warning.message}`;
}

function mergeWarnings(current: ScanWarning[], incoming: ScanWarning[]): ScanWarning[] {
  const seen = new Set(current.map(warningKey));
  const merged = [...current];

  for (const warning of incoming) {
    const key = warningKey(warning);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(warning);
    }
  }

  return merged;
}

@Injectable()
export class LibraryStore {
  private readonly api = inject(LibraryApiService);
  private readonly toast = inject(ToastService);
  private readonly state = signal<LibraryState>({
    status: 'loading',
    data: EMPTY_LIBRARY,
    warnings: [],
    error: null,
  });
  private readonly query = signal('');
  private readonly busyAction = signal<string | null>(null);

  readonly status = computed(() => this.state().status);
  readonly error = computed(() => this.state().error);
  readonly warnings = computed(() => this.state().warnings);
  readonly subjects = computed(() => this.state().data.subjects);
  readonly totalCourses = computed(() => this.state().data.totalCourses);
  readonly totalSubjects = computed(() => this.subjects().length);
  readonly busy = computed(() => this.busyAction() !== null);
  readonly searchQuery = this.query.asReadonly();
  readonly isSearching = computed(() => this.query().trim().length > 0);
  readonly hasContent = computed(() => this.totalSubjects() > 0 || this.totalCourses() > 0);
  readonly isEmpty = computed(() => this.status() === 'ready' && !this.hasContent());

  readonly filteredSubjects = computed<SubjectSummary[]>(() => {
    const query = normalized(this.query().trim());
    const subjects = this.subjects();

    if (query.length === 0) {
      return subjects;
    }

    return subjects.flatMap((subject) => {
      if (normalized(subject.name).includes(query)) {
        return [subject];
      }

      const courses = subject.courses.filter((course) =>
        [course.title, course.topic, course.audience].some((value) =>
          normalized(value).includes(query),
        ),
      );

      return courses.length === 0 ? [] : [{ ...subject, courses }];
    });
  });

  readonly visibleCourseCount = computed(() =>
    this.filteredSubjects().reduce((total, subject) => total + subject.courses.length, 0),
  );

  async load(options: { silent?: boolean } = {}): Promise<boolean> {
    if (!options.silent) {
      this.state.update((state) => ({ ...state, status: 'loading', error: null }));
    }

    try {
      const result = await firstValueFrom(this.api.getLibrary());
      this.state.update((state) => ({
        status: 'ready',
        data: result.data,
        warnings: options.silent ? mergeWarnings(state.warnings, result.warnings) : result.warnings,
        error: null,
      }));
      return true;
    } catch (error) {
      const clientError = asClientError(error);
      this.state.update((state) => ({
        ...state,
        status: options.silent && state.status === 'ready' ? 'ready' : 'error',
        error: clientError,
      }));
      this.toast.error(clientError.message);
      return false;
    }
  }

  setSearchQuery(value: string): void {
    this.query.set(value);
  }

  dismissWarnings(): void {
    this.state.update((state) => ({ ...state, warnings: [] }));
  }

  async createSubject(name: string): Promise<SubjectSummary | null> {
    const result = await this.runMutation(
      'create-subject',
      () => this.api.createSubject(name),
      (response) => `Created “${response.subject.name}”.`,
    );

    return result?.subject ?? null;
  }

  async renameSubject(id: string, name: string): Promise<SubjectSummary | null> {
    const result = await this.runMutation(
      'rename-subject',
      () => this.api.renameSubject(id, name),
      (response) => `Renamed to “${response.subject.name}”.`,
    );

    return result?.subject ?? null;
  }

  async moveCourse(courseId: string, subjectId: string): Promise<boolean> {
    const result = await this.runMutation(
      'move-course',
      () => this.api.moveCourse(courseId, subjectId),
      () => 'Course moved.',
    );

    return result !== null;
  }

  async moveCourseToNewSubject(courseId: string, subjectName: string): Promise<boolean> {
    if (this.busyAction() !== null) {
      this.toast.info('Another library change is still finishing.');
      return false;
    }

    this.busyAction.set('move-course');
    try {
      const subjectResult = await firstValueFrom(this.api.createSubject(subjectName));
      this.mergeWarnings(subjectResult.warnings);
      const createdSubject = subjectResult.data.subject;

      const moveResult = await firstValueFrom(this.api.moveCourse(courseId, createdSubject.id));
      this.mergeWarnings(moveResult.warnings);
      await this.load({ silent: true });
      this.toast.success(`Course moved to “${createdSubject.name}”.`);
      return true;
    } catch (error) {
      await this.handleFailure(asClientError(error));
      return false;
    } finally {
      this.busyAction.set(null);
    }
  }

  async deleteCourse(courseId: string): Promise<boolean> {
    const result = await this.runMutation(
      'delete-course',
      () => this.api.deleteCourse(courseId),
      () => 'Course deleted.',
    );

    return result !== null;
  }

  async deleteSubject(
    subjectId: string,
    options: { cascade: boolean; confirmName?: string },
  ): Promise<boolean> {
    const result = await this.runMutation(
      'delete-subject',
      () => this.api.deleteSubject(subjectId, options),
      (response) =>
        response.deletedCourses > 0
          ? `Subject and ${String(response.deletedCourses)} course${response.deletedCourses === 1 ? '' : 's'} deleted.`
          : 'Subject deleted.',
    );

    return result !== null;
  }

  async reorderSubjects(subjectIds: string[]): Promise<boolean> {
    if (this.busyAction() !== null) {
      return false;
    }

    const byId = new Map(this.subjects().map((subject) => [subject.id, subject]));
    const ordered = subjectIds
      .map((id) => byId.get(id))
      .filter((subject): subject is SubjectSummary => subject !== undefined);

    if (ordered.length !== this.subjects().length) {
      return false;
    }

    const previous = this.state().data;
    this.state.update((state) => ({
      ...state,
      data: { ...state.data, subjects: ordered },
    }));
    this.busyAction.set('reorder-subjects');

    try {
      const result = await firstValueFrom(this.api.reorderSubjects(subjectIds));
      this.mergeWarnings(result.warnings);
      await this.load({ silent: true });
      return true;
    } catch (error) {
      this.state.update((state) => ({ ...state, data: previous }));
      await this.handleFailure(asClientError(error));
      return false;
    } finally {
      this.busyAction.set(null);
    }
  }

  courseCountForSubject(subjectId: string): number {
    return this.subjects().find((subject) => subject.id === subjectId)?.courses.length ?? 0;
  }

  private async runMutation<T>(
    action: string,
    operation: () => Observable<LibraryApiResult<T>>,
    successMessage: (result: T) => string,
  ): Promise<T | null> {
    if (this.busyAction() !== null) {
      this.toast.info('Another library change is still finishing.');
      return null;
    }

    this.busyAction.set(action);
    try {
      const result = await firstValueFrom(operation());
      this.mergeWarnings(result.warnings);
      await this.load({ silent: true });
      this.toast.success(successMessage(result.data));
      return result.data;
    } catch (error) {
      await this.handleFailure(asClientError(error));
      return null;
    } finally {
      this.busyAction.set(null);
    }
  }

  private mergeWarnings(warnings: ScanWarning[]): void {
    this.state.update((state) => ({
      ...state,
      warnings: mergeWarnings(state.warnings, warnings),
    }));
  }

  private async handleFailure(error: ApiClientError): Promise<void> {
    this.toast.error(error.message);

    if (error.code === 'CONFLICT' && error.details['reason'] === 'stale_order') {
      await this.load({ silent: true });
    }
  }
}
