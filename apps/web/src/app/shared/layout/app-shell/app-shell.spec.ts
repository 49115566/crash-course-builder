import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ApiSuccess, BootstrapData, HealthData } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppShell } from './app-shell';

const bootstrapData: BootstrapData = {
  version: '0.1.0',
  libraryRoot: '/home/tester/CrashCourses',
  library: { status: 'ok' },
  provider: 'deepseek',
  model: 'deepseek-chat',
  key: { configured: true, source: 'environment' },
};

const healthData: HealthData = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 12,
  checks: {
    process: { status: 'ok' },
    library: { status: 'unknown' },
    key: { status: 'unknown' },
  },
};

describe('AppShell', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  function flushBootstrap(configured = true): void {
    httpMock.expectOne('/api/bootstrap').flush({
      data: {
        ...bootstrapData,
        key: { configured, source: configured ? 'environment' : 'none' },
      },
      requestId: 'bootstrap-1',
    } satisfies ApiSuccess<BootstrapData>);
  }

  it('renders the skip link, landmarks, and brand', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.ccb-skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(element.querySelector('header')).toBeTruthy();
    expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('Primary');
    expect(element.querySelector('main')?.id).toBe('main-content');
    expect(element.querySelector('footer')).toBeTruthy();
    expect(element.textContent).toContain('Crash Course Builder');

    flushBootstrap();
    httpMock.expectOne('/api/health').flush({
      data: healthData,
      requestId: 'request-1',
    } satisfies ApiSuccess<HealthData>);
  });

  it('announces a connected local service and version', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();

    flushBootstrap();
    httpMock.expectOne('/api/health').flush({
      data: healthData,
      requestId: 'request-1',
    } satisfies ApiSuccess<HealthData>);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Local service connected');
    expect(fixture.nativeElement.textContent).toContain('v0.1.0');
  });

  it('announces an unavailable local service without exposing details', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();

    flushBootstrap();
    httpMock
      .expectOne('/api/health')
      .flush('unavailable', { status: 0, statusText: 'Unknown Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Local service unavailable');
    expect(fixture.nativeElement.textContent).toContain('Start it with npm run dev');
  });

  it('shows a persistent key banner when no DeepSeek key is configured', async () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();

    flushBootstrap(false);
    httpMock.expectOne('/api/health').flush({
      data: healthData,
      requestId: 'request-1',
    } satisfies ApiSuccess<HealthData>);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('DeepSeek key not set');
    expect(fixture.nativeElement.textContent).toContain('npm run key:set');
  });
});
