import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiSuccess, BootstrapData } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { KeyBanner } from './key-banner';

const MISSING: BootstrapData = {
  version: '0.1.0',
  libraryRoot: '/tmp/library',
  library: { status: 'ok' },
  provider: 'deepseek',
  model: 'deepseek-chat',
  key: { configured: false, source: 'none' },
};

const CONFIGURED: BootstrapData = { ...MISSING, key: { configured: true, source: 'keychain' } };

describe('KeyBanner', () => {
  let http: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<KeyBanner>>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KeyBanner],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(BootstrapStore);
    fixture = TestBed.createComponent(KeyBanner);

    const loading = store.load();
    http.expectOne('/api/bootstrap').flush({
      data: MISSING,
      requestId: '1',
    } satisfies ApiSuccess<BootstrapData>);
    void loading;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('stays visible until the key is found', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DeepSeek key not set');

    const button = fixture.nativeElement.querySelector(
      '.key-banner__button--primary',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    http.expectOne('/api/bootstrap').flush({
      data: CONFIGURED,
      requestId: '2',
    } satisfies ApiSuccess<BootstrapData>);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('DeepSeek key not set');
  });
});
