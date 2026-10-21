import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiSuccess,
  CourseMutationResponse,
  DeleteCourseResponse,
  DeleteSubjectResponse,
  LibraryData,
  ReorderSubjectsResponse,
  ScanWarning,
  SubjectMutationResponse,
} from '@ccb/contracts';
import { catchError, map, throwError, type Observable } from 'rxjs';

import { toApiClientError, type ApiClientError } from './api-error';

export interface LibraryApiResult<T> {
  data: T;
  warnings: ScanWarning[];
}

@Injectable({ providedIn: 'root' })
export class LibraryApiService {
  private readonly http = inject(HttpClient);

  getLibrary(): Observable<LibraryApiResult<LibraryData>> {
    return this.request(this.http.get<ApiSuccess<LibraryData>>('/api/library'));
  }

  createSubject(name: string): Observable<LibraryApiResult<SubjectMutationResponse>> {
    return this.request(
      this.http.post<ApiSuccess<SubjectMutationResponse>>('/api/subjects', { name }),
    );
  }

  renameSubject(id: string, name: string): Observable<LibraryApiResult<SubjectMutationResponse>> {
    return this.request(
      this.http.patch<ApiSuccess<SubjectMutationResponse>>(`/api/subjects/${id}`, { name }),
    );
  }

  reorderSubjects(subjectIds: string[]): Observable<LibraryApiResult<ReorderSubjectsResponse>> {
    return this.request(
      this.http.put<ApiSuccess<ReorderSubjectsResponse>>('/api/subjects/order', { subjectIds }),
    );
  }

  moveCourse(
    courseId: string,
    subjectId: string,
  ): Observable<LibraryApiResult<CourseMutationResponse>> {
    return this.request(
      this.http.post<ApiSuccess<CourseMutationResponse>>(`/api/courses/${courseId}/move`, {
        subjectId,
      }),
    );
  }

  deleteCourse(courseId: string): Observable<LibraryApiResult<DeleteCourseResponse>> {
    return this.request(
      this.http.delete<ApiSuccess<DeleteCourseResponse>>(`/api/courses/${courseId}`, {
        body: { confirmed: true },
      }),
    );
  }

  deleteSubject(
    subjectId: string,
    options: { cascade: boolean; confirmName?: string },
  ): Observable<LibraryApiResult<DeleteSubjectResponse>> {
    return this.request(
      this.http.delete<ApiSuccess<DeleteSubjectResponse>>(`/api/subjects/${subjectId}`, {
        body: {
          confirmed: true,
          cascade: options.cascade,
          ...(options.confirmName === undefined ? {} : { confirmName: options.confirmName }),
        },
      }),
    );
  }

  private request<T>(source: Observable<ApiSuccess<T>>): Observable<LibraryApiResult<T>> {
    return source.pipe(
      map((response) => ({
        data: response.data,
        warnings: response.warnings ?? [],
      })),
      catchError((error: HttpErrorResponse) =>
        throwError(() => toApiClientError(error) satisfies ApiClientError),
      ),
    );
  }
}
