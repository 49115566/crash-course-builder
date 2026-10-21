import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiSuccess,
  CreateSessionRequest,
  DeleteSessionResponse,
  SessionDataResponse,
  SessionListResponse,
  SessionSummaryResponse,
  UpdateSessionInputsRequest,
} from '@ccb/contracts';
import { catchError, map, throwError, type Observable } from 'rxjs';

import { toApiClientError, type ApiClientError } from './api-error';

@Injectable({ providedIn: 'root' })
export class SessionApiService {
  private readonly http = inject(HttpClient);

  create(request: CreateSessionRequest): Observable<SessionDataResponse> {
    return this.request(this.http.post<ApiSuccess<SessionDataResponse>>('/api/sessions', request));
  }

  get(sessionId: string): Observable<SessionDataResponse> {
    return this.request(
      this.http.get<ApiSuccess<SessionDataResponse>>(`/api/sessions/${sessionId}`),
    );
  }

  listActive(): Observable<SessionListResponse> {
    return this.request(
      this.http.get<ApiSuccess<SessionListResponse>>('/api/sessions', {
        params: { active: 'true' },
      }),
    );
  }

  updateInputs(
    sessionId: string,
    request: UpdateSessionInputsRequest,
  ): Observable<SessionDataResponse> {
    return this.request(
      this.http.patch<ApiSuccess<SessionDataResponse>>(
        `/api/sessions/${sessionId}/inputs`,
        request,
      ),
    );
  }

  startOutline(sessionId: string): Observable<SessionSummaryResponse> {
    return this.request(
      this.http.post<ApiSuccess<SessionSummaryResponse>>(`/api/sessions/${sessionId}/outline`, {}),
    );
  }

  regenerateOutline(sessionId: string): Observable<SessionSummaryResponse> {
    return this.request(
      this.http.post<ApiSuccess<SessionSummaryResponse>>(
        `/api/sessions/${sessionId}/regenerate-outline`,
        {},
      ),
    );
  }

  approve(sessionId: string): Observable<SessionSummaryResponse> {
    return this.request(
      this.http.post<ApiSuccess<SessionSummaryResponse>>(`/api/sessions/${sessionId}/approve`, {}),
    );
  }

  pause(sessionId: string): Observable<SessionSummaryResponse> {
    return this.request(
      this.http.post<ApiSuccess<SessionSummaryResponse>>(`/api/sessions/${sessionId}/pause`, {}),
    );
  }

  stop(sessionId: string): Observable<SessionSummaryResponse> {
    return this.request(
      this.http.post<ApiSuccess<SessionSummaryResponse>>(`/api/sessions/${sessionId}/stop`, {}),
    );
  }

  resume(sessionId: string): Observable<SessionSummaryResponse> {
    return this.request(
      this.http.post<ApiSuccess<SessionSummaryResponse>>(`/api/sessions/${sessionId}/resume`, {}),
    );
  }

  delete(sessionId: string): Observable<DeleteSessionResponse> {
    return this.request(
      this.http.delete<ApiSuccess<DeleteSessionResponse>>(`/api/sessions/${sessionId}`),
    );
  }

  eventsUrl(sessionId: string): string {
    return `/api/sessions/${sessionId}/events`;
  }

  private request<T>(source: Observable<ApiSuccess<T>>): Observable<T> {
    return source.pipe(
      map((response) => response.data),
      catchError((error: HttpErrorResponse) =>
        throwError(() => toApiClientError(error) satisfies ApiClientError),
      ),
    );
  }
}
