import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, HealthData } from '@ccb/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { HealthService, type ServiceHealth } from './health.service';

const healthData: HealthData = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 5,
  checks: {
    process: { status: 'ok' },
    library: { status: 'unknown' },
    key: { status: 'unknown' },
  },
};

describe('HealthService', () => {
  let httpMock: HttpTestingController;

  function createService(): HealthService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(HealthService);
  }

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('maps a successful response to connected state', () => {
    const service = createService();
    let result: ServiceHealth | undefined;

    service.getHealth().subscribe((health) => {
      result = health;
    });

    const request = httpMock.expectOne('/api/health');
    const response: ApiSuccess<HealthData> = { data: healthData, requestId: 'request-1' };
    request.flush(response);

    expect(result).toEqual({ state: 'connected', data: healthData });
  });

  it('maps an error envelope to unavailable state', () => {
    const service = createService();
    let result: ServiceHealth | undefined;

    service.getHealth().subscribe((health) => {
      result = health;
    });

    const request = httpMock.expectOne('/api/health');
    request.flush(
      {
        error: {
          code: 'LIBRARY_UNAVAILABLE',
          message: 'The library is unavailable.',
          retryable: true,
          details: {},
        },
      },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(result).toMatchObject({
      state: 'unavailable',
      error: { code: 'LIBRARY_UNAVAILABLE', status: 503 },
    });
  });
});
