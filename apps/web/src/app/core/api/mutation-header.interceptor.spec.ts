import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mutationHeaderInterceptor } from './mutation-header.interceptor';

describe('mutationHeaderInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([mutationHeaderInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'adds the request header to API %s requests',
    (method) => {
      client.request(method, '/api/sessions/one').subscribe();

      const request = http.expectOne('/api/sessions/one');
      expect(request.request.headers.get(MUTATION_HEADER_NAME)).toBe(MUTATION_HEADER_VALUE);
      request.flush({});
    },
  );

  it('does not add the header to reads or non-API requests', () => {
    client.get('/api/library').subscribe();
    const read = http.expectOne('/api/library');
    expect(read.request.headers.has(MUTATION_HEADER_NAME)).toBe(false);
    read.flush({});

    client.post('https://example.com/collect', {}).subscribe();
    const external = http.expectOne('https://example.com/collect');
    expect(external.request.headers.has(MUTATION_HEADER_NAME)).toBe(false);
    external.flush({});
  });
});
