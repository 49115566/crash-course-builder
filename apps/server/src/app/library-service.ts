import type { ScanWarning, SubjectSummary } from '@ccb/contracts';

import { LibraryError } from '../domain/library-errors.js';
import type {
  CourseMutationResult,
  DeleteCourseResult,
  DeleteSubjectOptions,
  DeleteSubjectResult,
  FinalizeCourseInput,
  FinalizeCourseResult,
  LibraryRepository,
  LibrarySnapshot,
  SubjectMutationResult,
} from '../ports/library-repository.js';
import { AsyncLock } from './async-lock.js';

export interface LibraryReadiness {
  status: 'ok' | 'degraded';
  message?: string;
}

export class LibraryService {
  private readonly lock = new AsyncLock();
  private readiness: LibraryReadiness = {
    status: 'degraded',
    message: 'The library has not been initialized yet.',
  };

  constructor(private readonly repository: LibraryRepository) {}

  async initialize(): Promise<void> {
    try {
      await this.lock.run(() => this.repository.initialize());
      this.readiness = { status: 'ok' };
    } catch (error) {
      this.readiness = {
        status: 'degraded',
        message:
          error instanceof Error ? error.message : 'The library folder could not be prepared.',
      };
      throw error;
    }
  }

  getReadiness(): LibraryReadiness {
    return this.readiness;
  }

  async getLibrary(): Promise<LibrarySnapshot> {
    return this.runWithReady(() => this.repository.scan());
  }

  async getSubject(id: string): Promise<SubjectSummary> {
    return this.runWithReady(async () => {
      const snapshot = await this.repository.scan();
      const subject = snapshot.subjects.find((entry) => entry.id === id);

      if (subject === undefined) {
        throw new LibraryError('NOT_FOUND', 'The subject could not be found.');
      }

      return subject;
    });
  }

  async finalizeCourse(input: FinalizeCourseInput): Promise<FinalizeCourseResult> {
    return this.runWithReady(() => this.repository.finalizeCourse(input));
  }

  async createSubject(name: string): Promise<SubjectMutationResult> {
    return this.runWithReady(() => this.repository.createSubject(name));
  }

  async renameSubject(id: string, name: string): Promise<SubjectMutationResult> {
    return this.runWithReady(() => this.repository.renameSubject(id, name));
  }

  async reorderSubjects(
    subjectIds: string[],
  ): Promise<{ subjectIds: string[]; warnings: ScanWarning[] }> {
    return this.runWithReady(() => this.repository.reorderSubjects(subjectIds));
  }

  async moveCourse(courseId: string, subjectId: string): Promise<CourseMutationResult> {
    return this.runWithReady(() => this.repository.moveCourse(courseId, subjectId));
  }

  async deleteCourse(courseId: string): Promise<DeleteCourseResult> {
    return this.runWithReady(() => this.repository.deleteCourse(courseId));
  }

  async deleteSubject(id: string, options: DeleteSubjectOptions): Promise<DeleteSubjectResult> {
    return this.runWithReady(() => this.repository.deleteSubject(id, options));
  }

  private async runWithReady<T>(operation: () => Promise<T>): Promise<T> {
    return this.lock.run(async () => {
      if (this.readiness.status !== 'ok') {
        try {
          await this.repository.initialize();
          this.readiness = { status: 'ok' };
        } catch (error) {
          this.readiness = {
            status: 'degraded',
            message:
              error instanceof Error ? error.message : 'The library folder could not be prepared.',
          };
          throw error instanceof LibraryError
            ? error
            : new LibraryError(
                'LIBRARY_UNAVAILABLE',
                'The library folder could not be prepared.',
                {},
                { cause: error },
              );
        }
      }

      try {
        return await operation();
      } catch (error) {
        if (error instanceof LibraryError) {
          throw error;
        }
        throw new LibraryError(
          'LIBRARY_SCAN_FAILED',
          'The library could not be read or updated.',
          {},
          { cause: error },
        );
      }
    });
  }
}
