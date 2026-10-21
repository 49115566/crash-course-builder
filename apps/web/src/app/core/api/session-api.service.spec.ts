import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeDraftSession, makeOutlineSession, summaryOf } from '../../testing/session-fixtures';
import { SessionApiService } from './session-api.service';

describe('SessionApiService', () => {
  let service: SessionApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(SessionApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('creates, loads, lists, updates, and deletes sessions', () => {
    const draft = makeDraftSession();
    service
      .create({
        subjectId: draft.subject.id,
        topic: draft.input.topic,
        audience: draft.input.audience,
      })
      .subscribe();
    const create = http.expectOne('/api/sessions');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      subjectId: draft.subject.id,
      topic: draft.input.topic,
      audience: draft.input.audience,
    });
    create.flush({ data: { session: draft }, requestId: '1' });

    service.get(draft.id).subscribe();
    http.expectOne(`/api/sessions/${draft.id}`).flush({ data: { session: draft }, requestId: '1' });

    service.listActive().subscribe();
    const list = http.expectOne('/api/sessions?active=true');
    expect(list.request.method).toBe('GET');
    list.flush({ data: { sessions: [] }, requestId: '1' });

    service
      .updateInputs(draft.id, {
        subjectId: draft.subject.id,
        topic: 'Graph Databases',
        audience: 'developers',
      })
      .subscribe();
    const update = http.expectOne(`/api/sessions/${draft.id}/inputs`);
    expect(update.request.method).toBe('PATCH');
    update.flush({ data: { session: draft }, requestId: '1' });

    service.delete(draft.id).subscribe();
    const remove = http.expectOne(`/api/sessions/${draft.id}`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush({ data: { deletedId: draft.id }, requestId: '1' });
  });

  it('uses the approval, regeneration, and recovery endpoints', () => {
    const session = makeOutlineSession();
    const summary = summaryOf(session);

    service.startOutline(session.id).subscribe();
    const start = http.expectOne(`/api/sessions/${session.id}/outline`);
    expect(start.request.method).toBe('POST');
    start.flush({ data: { session: summary }, requestId: '1' });

    service.regenerateOutline(session.id).subscribe();
    http.expectOne(`/api/sessions/${session.id}/regenerate-outline`).flush({
      data: { session: summary },
      requestId: '1',
    });

    service.approve(session.id).subscribe();
    http.expectOne(`/api/sessions/${session.id}/approve`).flush({
      data: { session: summary },
      requestId: '1',
    });

    service.pause(session.id).subscribe();
    http.expectOne(`/api/sessions/${session.id}/pause`).flush({
      data: { session: summary },
      requestId: '1',
    });

    service.stop(session.id).subscribe();
    http.expectOne(`/api/sessions/${session.id}/stop`).flush({
      data: { session: summary },
      requestId: '1',
    });

    service.resume(session.id).subscribe();
    http.expectOne(`/api/sessions/${session.id}/resume`).flush({
      data: { session: summary },
      requestId: '1',
    });
  });

  it('maps error envelopes to the shared client error', async () => {
    const promise = new Promise<unknown>((resolve) => {
      service.get('123e4567-e89b-42d3-a456-426614174020').subscribe({
        error: resolve,
      });
    });

    const request = http.expectOne('/api/sessions/123e4567-e89b-42d3-a456-426614174020');
    request.flush(
      {
        error: {
          code: 'GENERATION_BUSY',
          message: 'Another course is being generated.',
          retryable: false,
          details: { activeSessionId: '123e4567-e89b-42d3-a456-426614174099' },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(promise).resolves.toMatchObject({
      code: 'GENERATION_BUSY',
      details: { activeSessionId: '123e4567-e89b-42d3-a456-426614174099' },
    });
  });
});
