import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ButtonDirective } from './button.directive';

@Component({
  imports: [ButtonDirective],
  template: `
    <button ccbButton type="button">Primary</button>
    <a ccbButton variant="secondary" size="sm" href="/courses">Secondary</a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ButtonHost {}

describe('ButtonDirective', () => {
  it('applies the base and variant classes', () => {
    const fixture = TestBed.createComponent(ButtonHost);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const primary = element.querySelector('button');
    const secondary = element.querySelector('a');

    expect(primary?.classList.contains('ccb-button')).toBe(true);
    expect(primary?.classList.contains('ccb-button--primary')).toBe(true);
    expect(secondary?.classList.contains('ccb-button--secondary')).toBe(true);
    expect(secondary?.classList.contains('ccb-button--sm')).toBe(true);
  });
});
