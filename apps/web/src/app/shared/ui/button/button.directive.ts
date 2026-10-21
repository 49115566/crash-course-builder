import { Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

@Directive({
  selector: '[ccbButton]',
  host: {
    class: 'ccb-button',
    '[class.ccb-button--primary]': 'variant() === "primary"',
    '[class.ccb-button--secondary]': 'variant() === "secondary"',
    '[class.ccb-button--ghost]': 'variant() === "ghost"',
    '[class.ccb-button--danger]': 'variant() === "danger"',
    '[class.ccb-button--sm]': 'size() === "sm"',
  },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
}
