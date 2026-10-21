import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ApiSuccess, SessionData } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EVENT_SOURCE_FACTORY,
  type EventSourceFactory,
} from '../../core/realtime/session-event-stream';
import { SessionWizardStore } from './wizard.store';
import {
  makeDraftSession,
  makeOutlineSession,
  makeWritingSession,
  summaryOf,
} from '../../testing/session-fixtures';

class FakeEventSource {
  readyState = 0;
  readonly close = vi.fn(() => {
    this.readyState = 2;
  });
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  emit(type: string, payload?: unknown): void {
    const event =
      payload === undefined
        ? new Event(type)
        : (new MessageEvent(type, { data: JSON.stringify(payload) }) as Event);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('SessionWizardStore', () => {
  let store: SessionWizardStore;
  let http: HttpTestingController;
  let sources: FakeEventSource[];

  beforeEach(() => {
    sources = [];
    const factory: EventSourceFactory = () => {
      const source = new FakeEventSource();
      sources.push(source);
      return source as unknown as EventSource;
    };

    TestBed.configureTestingModule({
      providers: [
        SessionWizardStore,
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EVENT_SOURCE_FACTORY, useValue: factory },
        { provide: LiveAnnouncer, useValue: { announce: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    store = TestBed.inject(SessionWizardStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.dispose();
    http.verify();
    TestBed.resetTestingModule();
  });

  async function load(session: SessionData): Promise<void> {
    const promise = store.ensureLoaded(session.id);
    http.expectOne(`/api/sessions/${session.id}`).flush({
      data: { session },
      requestId: '1',
    } satisfies ApiSuccess<{ session: SessionData }>);
    await promise;
    sources.at(-1)?.open();
  }

  it('loads a draft and buffers live deltas before exposing them', async () => {
    vi.useFakeTimers();
    const draft = makeDraftSession();
    await load(draft);

    expect(store.session()?.id).toBe(draft.id);
    expect(store.totalSections()).toBe(0);
    expect(store.statusLabel()).toBe('Draft');
    expect(store.connection()).toBe('open');

    sources.at(-1)?.emit('outline_delta', {
      type: 'outline_delta',
      sessionId: draft.id,
      at: draft.updatedAt,
      text: '# Draft',
    });
    expect(store.liveOutline()).toBe('');

    vi.advanceTimersByTime(50);
    expect(store.liveOutline()).toBe('# Draft');
    vi.useRealTimers();
  });

  it('tracks section deltas, failure, and completion through events', async () => {
    vi.useFakeTimers();
    const writing = makeWritingSession();
    await load(writing);
    const source = sources.at(-1);

    source?.emit('section_delta', {
      type: 'section_delta',
      sessionId: writing.id,
      at: writing.updatedAt,
      sectionNumber: 2,
      text: 'Indexes make search fast.',
    });
    vi.advanceTimersByTime(50);
    expect(store.currentLiveText()).toBe('Indexes make search fast.');
    expect(store.currentLiveWords()).toBe(4);

    source?.emit('section_completed', {
      type: 'section_completed',
      sessionId: writing.id,
      at: writing.updatedAt,
      sectionNumber: 2,
      markdown: '## 2. Indexing\n\nIndexes make search fast.',
    });
    expect(store.completedSections()).toBe(2);
    expect(store.sections()[1]?.status).toBe('completed');

    const error = {
      code: 'AI_TIMEOUT' as const,
      message: 'Timed out while writing.',
      retryable: true,
      details: {},
      at: writing.updatedAt,
    };
    source?.emit('section_failed', {
      type: 'section_failed',
      sessionId: writing.id,
      at: writing.updatedAt,
      sectionNumber: 2,
      error,
    });
    expect(store.needsAttention()).toBe(true);
    expect(store.statusLabel()).toBe('Paused — needs attention');
    expect(store.lastError()?.message).toBe('Timed out while writing.');

    source?.emit('completed', {
      type: 'completed',
      sessionId: writing.id,
      at: writing.updatedAt,
      courseId: writing.courseId,
      savedPath: 'Computer Science/Vector Databases',
      stats: { sections: 2, words: 100, readingMinutes: 1 },
    });
    expect(store.isComplete()).toBe(true);
    expect(store.savedPath()).toBe('Computer Science/Vector Databases');
    expect(store.completionStats()).toEqual({ sections: 2, words: 100, readingMinutes: 1 });
    expect(store.connection()).toBe('closed');
    vi.useRealTimers();
  });

  it('approves an outline, reconciles the session, and reconnects', async () => {
    const review = makeOutlineSession();
    await load(review);
    const writing = makeWritingSession({ id: review.id });

    const approved = store.approve();
    const request = http.expectOne(`/api/sessions/${review.id}/approve`);
    request.flush({
      data: { session: summaryOf(writing) },
      requestId: '1',
    } satisfies ApiSuccess<{ session: ReturnType<typeof summaryOf> }>);

    await Promise.resolve();
    http.expectOne(`/api/sessions/${review.id}`).flush({
      data: { session: writing },
      requestId: '2',
    });
    await approved;

    expect(store.session()?.status).toBe('expanding');
    expect(store.canApprove()).toBe(false);
    expect(sources.length).toBeGreaterThan(1);
    expect(store.action()).toBeNull();
  });

  it('surfaces GENERATION_BUSY without changing the draft', async () => {
    const draft = makeDraftSession();
    await load(draft);

    const started = store.startOutline();
    http.expectOne(`/api/sessions/${draft.id}/outline`).flush(
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

    await expect(started).resolves.toBe(false);
    expect(store.actionError()?.code).toBe('GENERATION_BUSY');
    expect(store.session()?.status).toBe('draft');
  });

  it('switches cleanly to a different session and opens a new stream', async () => {
    const first = makeDraftSession();
    await load(first);
    const firstSource = sources.at(-1);

    const second = makeOutlineSession({
      id: '123e4567-e89b-42d3-a456-426614174099',
      subject: { id: '123e4567-e89b-42d3-a456-42661417400b', name: 'Marketing' },
    });
    const switching = store.ensureLoaded(second.id);
    http.expectOne(`/api/sessions/${second.id}`).flush({
      data: { session: second },
      requestId: '2',
    });
    await switching;

    expect(firstSource?.close).toHaveBeenCalled();
    expect(store.session()?.id).toBe(second.id);
    expect(store.session()?.subject.name).toBe('Marketing');
    expect(sources.at(-1)).not.toBe(firstSource);
  });

  it('patches inputs and exposes the rebuilt prompt', async () => {
    const review = makeOutlineSession();
    await load(review);
    const draft = makeDraftSession({
      id: review.id,
      input: { ...review.input, topic: 'Graph Databases' },
    });

    const updating = store.updateInputs({
      subjectId: review.subject.id,
      topic: 'Graph Databases',
      audience: review.input.audience,
    });
    const request = http.expectOne(`/api/sessions/${review.id}/inputs`);
    expect(request.request.method).toBe('PATCH');
    request.flush({ data: { session: draft }, requestId: '1' });
    await expect(updating).resolves.toMatchObject({ status: 'draft' });

    expect(store.session()?.input.topic).toBe('Graph Databases');
  });
});
