import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { ApiSuccess, BootstrapData, LibraryData, SessionData } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENT_SOURCE_FACTORY } from '../../../core/realtime/session-event-stream';
import { SessionWizardStore } from '../wizard.store';
import { makeDraftSession } from '../../../testing/session-fixtures';
import { DetailsPage } from './details.page';

const LIBRARY: LibraryData = {
  subjects: [
    {
      id: '123e4567-e89b-42d3-a456-42661417400a',
      name: 'Computer Science',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      courses: [],
    },
  ],
  totalCourses: 0,
};

const BOOTSTRAP: BootstrapData = {
  version: '0.1.0',
  libraryRoot: '/tmp/library',
  library: { status: 'ok' },
  provider: 'deepseek',
  model: 'deepseek-chat',
  key: { configured: true, source: 'environment' },
};

describe('DetailsPage', () => {
  let http: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<DetailsPage>>;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DetailsPage],
      providers: [
        SessionWizardStore,
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
        { provide: LiveAnnouncer, useValue: { announce: vi.fn().mockResolvedValue(undefined) } },
        { provide: EVENT_SOURCE_FACTORY, useValue: () => ({ close: vi.fn() }) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(DetailsPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    TestBed.resetTestingModule();
  });

  async function flushInitial(): Promise<void> {
    http.expectOne('/api/bootstrap').flush({
      data: BOOTSTRAP,
      requestId: '1',
    } satisfies ApiSuccess<BootstrapData>);
    http.expectOne('/api/library').flush({
      data: LIBRARY,
      requestId: '1',
    } satisfies ApiSuccess<LibraryData>);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('preselects a subject and creates a draft session', async () => {
    await flushInitial();
    const element = fixture.nativeElement as HTMLElement;
    expect((element.querySelector('#course-subject') as HTMLInputElement).value).toBe(
      'Computer Science',
    );

    const topic = element.querySelector('#course-topic') as HTMLInputElement;
    topic.value = 'Vector Databases';
    topic.dispatchEvent(new Event('input'));
    const audience = element.querySelector('#course-audience') as HTMLInputElement;
    audience.value = 'software engineers';
    audience.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const session = makeDraftSession();
    const request = http.expectOne('/api/sessions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      subjectId: LIBRARY.subjects[0]?.id,
      topic: 'Vector Databases',
      audience: 'software engineers',
    });
    request.flush({ data: { session }, requestId: '2' } satisfies ApiSuccess<{
      session: SessionData;
    }>);
    await fixture.whenStable();

    expect(router.navigate).toHaveBeenCalledWith(['/courses/new', session.id, 'prompts'], {
      replaceUrl: true,
    });
  });

  it('blocks submission and explains missing fields', async () => {
    await flushInitial();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(element.textContent).toContain('Give this course a topic.');
    expect(element.textContent).toContain('Describe who this course is for.');
    http.expectNone('/api/sessions');
  });
});
