import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Spinner } from './spinner';

describe('Spinner', () => {
  it('exposes an accessible status label', () => {
    TestBed.configureTestingModule({
      imports: [Spinner],
      providers: [provideZonelessChangeDetection()],
    });

    const fixture = TestBed.createComponent(Spinner);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="status"]')?.textContent).toContain('Loading');
  });
});
