import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiSuccess, BootstrapData } from '@ccb/contracts';
import { catchError, map, throwError, type Observable } from 'rxjs';
import type { HttpErrorResponse } from '@angular/common/http';

import { toApiClientError } from './api-error';

@Injectable({ providedIn: 'root' })
export class BootstrapService {
  private readonly http = inject(HttpClient);

  getBootstrap(): Observable<BootstrapData> {
    return this.http.get<ApiSuccess<BootstrapData>>('/api/bootstrap').pipe(
      map((response) => response.data),
      catchError((error: HttpErrorResponse) => throwError(() => toApiClientError(error))),
    );
  }
}
