import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { BadgeDirective } from './badge.directive';

@Component({
  imports: [BadgeDirective],
  template: `<span ccbBadge tone="success">Complete</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class BadgeHost {}

describe('BadgeDirective', () => {
  it('applies the base and tone classes', () => {
    const fixture = TestBed.createComponent(BadgeHost);
    fixture.detectChanges();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('span');

    expect(badge?.classList.contains('ccb-badge')).toBe(true);
    expect(badge?.classList.contains('ccb-badge--success')).toBe(true);
  });
});
