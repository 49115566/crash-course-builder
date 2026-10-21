import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `<ccb-empty-state heading="Nothing here" body="Add something when you are ready." />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EmptyStateHost {}

describe('EmptyState', () => {
  it('renders its heading and body', () => {
    const fixture = TestBed.createComponent(EmptyStateHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h2')?.textContent).toContain('Nothing here');
    expect(element.textContent).toContain('Add something when you are ready.');
  });
});
