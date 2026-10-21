import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiSuccess, CourseDetail } from '@ccb/contracts';
import { catchError, map, throwError, type Observable } from 'rxjs';

import { toApiClientError } from './api-error';

@Injectable({ providedIn: 'root' })
export class CourseApiService {
  private readonly http = inject(HttpClient);

  getCourse(courseId: string): Observable<CourseDetail> {
    return this.http.get<ApiSuccess<CourseDetail>>(`/api/courses/${courseId}`).pipe(
      map((response) => response.data),
      catchError((error: HttpErrorResponse) => throwError(() => toApiClientError(error))),
    );
  }
}
