import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ccb-skeleton',
  template: '<span class="skeleton" [style.width]="width()" [style.height]="height()"></span>',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('0.9rem');
}
