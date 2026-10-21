import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiSuccess, HealthData } from '@ccb/contracts';
import { catchError, map, of, type Observable } from 'rxjs';

import { toApiClientError, type ApiClientError } from './api-error';

export type ServiceHealth =
  { state: 'connected'; data: HealthData } | { state: 'unavailable'; error: ApiClientError };

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  getHealth(): Observable<ServiceHealth> {
    return this.http.get<ApiSuccess<HealthData>>('/api/health').pipe(
      map((response) => ({ state: 'connected' as const, data: response.data })),
      catchError((error: HttpErrorResponse) =>
        of({
          state: 'unavailable' as const,
          error: toApiClientError(error),
        }),
      ),
    );
  }
}
