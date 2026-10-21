import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ccb-empty-state',
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly body = input<string>();
}
