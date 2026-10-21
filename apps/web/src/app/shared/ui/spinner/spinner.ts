import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ccb-spinner',
  template: `
    <span class="spinner" role="status">
      <span class="ccb-visually-hidden">{{ label() }}</span>
    </span>
  `,
  styleUrl: './spinner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Spinner {
  readonly label = input('Loading');
}
