import { Directive, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

@Directive({
  selector: '[ccbBadge]',
  host: {
    class: 'ccb-badge',
    '[class.ccb-badge--neutral]': 'tone() === "neutral"',
    '[class.ccb-badge--accent]': 'tone() === "accent"',
    '[class.ccb-badge--success]': 'tone() === "success"',
    '[class.ccb-badge--warning]': 'tone() === "warning"',
    '[class.ccb-badge--danger]': 'tone() === "danger"',
  },
})
export class BadgeDirective {
  readonly tone = input<BadgeTone>('neutral');
}
