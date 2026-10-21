import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SubjectSummary } from '@ccb/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { SubjectCombobox } from './subject-combobox';

const SUBJECTS: SubjectSummary[] = [
  {
    id: '123e4567-e89b-42d3-a456-42661417400a',
    name: 'Computer Science',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    courses: [],
  },
  {
    id: '123e4567-e89b-42d3-a456-42661417400b',
    name: 'Marketing',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    courses: [],
  },
];

describe('SubjectCombobox', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SubjectCombobox],
      providers: [provideZonelessChangeDetection()],
    });
  });

  function setup() {
    const fixture = TestBed.createComponent(SubjectCombobox);
    fixture.componentRef.setInput('subjects', SUBJECTS);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, input };
  }

  it('filters subjects and selects one with the keyboard', () => {
    const { fixture, input } = setup();
    const changes: Array<string | null> = [];
    fixture.componentInstance.registerOnChange((value) => changes.push(value));

    input.value = 'mark';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(changes).toEqual([SUBJECTS[1]?.id]);
    expect(input.value).toBe('Marketing');
  });

  it('offers inline creation for a new subject', () => {
    const { fixture, input } = setup();
    const created: string[] = [];
    fixture.componentInstance.createRequested.subscribe((name) => created.push(name));

    input.value = 'Art History';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    (options[0] as HTMLElement).click();

    expect(created).toEqual(['Art History']);
  });

  it('rejects reserved names before asking the page to create them', () => {
    const { fixture, input } = setup();
    const created: string[] = [];
    fixture.componentInstance.createRequested.subscribe((name) => created.push(name));

    input.value = 'CON';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const option = fixture.nativeElement.querySelector('.combobox__option--create') as HTMLElement;
    expect(option.getAttribute('aria-disabled')).toBe('true');
    option.click();
    expect(created).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('reserved by Windows');
  });

  it('clears the selected value when the query changes', () => {
    const { fixture, input } = setup();
    fixture.componentInstance.writeValue(SUBJECTS[0]?.id ?? null);
    fixture.detectChanges();
    const changes: Array<string | null> = [];
    fixture.componentInstance.registerOnChange((value) => changes.push(value));

    input.value = 'Computer';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(changes).toEqual([null]);
  });
});
