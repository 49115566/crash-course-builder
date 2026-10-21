import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, SessionSummary } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToastService } from '../../shared/ui/toast/toast.service';
import { ActiveSessionsStore } from './active-sessions.store';

const SESSION: SessionSummary = {
  id: '123e4567-e89b-42d3-a456-426614174020',
  status: 'paused',
  stage: 'sections',
  subject: { id: '123e4567-e89b-42d3-a456-42661417400a', name: 'Computer Science' },
  topic: 'Vector Databases',
  audience: 'software engineers',
  title: 'Vector Databases: A 30-Minute Crash Course',
  sectionCount: 7,
  completedSections: 3,
  courseId: '123e4567-e89b-42d3-a456-426614174021',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  pauseReason: 'user',
};

describe('ActiveSessionsStore', () => {
  let store: ActiveSessionsStore;
  let http: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ActiveSessionsStore,
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(ActiveSessionsStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('loads in-progress summaries', async () => {
    const promise = store.load();
    http.expectOne('/api/sessions?active=true').flush({
      data: { sessions: [SESSION] },
      requestId: '1',
    } satisfies ApiSuccess<{ sessions: SessionSummary[] }>);
    await promise;

    expect(store.status()).toBe('ready');
    expect(store.sessions()).toEqual([SESSION]);
    expect(store.hasSessions()).toBe(true);
  });

  it('discards a session and removes it from the strip', async () => {
    const loaded = store.load();
    http.expectOne('/api/sessions?active=true').flush({
      data: { sessions: [SESSION] },
      requestId: '1',
    });
    await loaded;

    const discarded = store.discard(SESSION.id);
    const request = http.expectOne(`/api/sessions/${SESSION.id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { deletedId: SESSION.id }, requestId: '2' });

    await expect(discarded).resolves.toBe(true);
    expect(store.sessions()).toEqual([]);
    expect(toast.toasts().at(-1)?.message).toContain('discarded');
  });

  it('keeps a retryable error without blocking the library', async () => {
    const promise = store.load();
    http.expectOne('/api/sessions?active=true').flush('down', {
      status: 0,
      statusText: 'Unknown Error',
    });
    await promise;

    expect(store.status()).toBe('error');
    expect(store.error()?.code).toBe('NETWORK_ERROR');
  });
});
