import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LibraryHomePage } from './library-home.page';

describe('LibraryHomePage', () => {
  it('renders the library heading and foundation empty state', () => {
    TestBed.configureTestingModule({
      imports: [LibraryHomePage],
      providers: [provideZonelessChangeDetection()],
    });

    const fixture = TestBed.createComponent(LibraryHomePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toContain('Your library');
    expect(element.textContent).toContain('Your shelf is empty');
    expect(element.textContent).toContain('Preview');
  });
});
