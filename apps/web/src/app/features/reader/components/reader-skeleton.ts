import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ccb-reader-skeleton',
  template: `
    <div class="reader-skeleton" aria-hidden="true">
      <div class="reader-skeleton__toolbar">
        <span class="reader-skeleton__line reader-skeleton__line--crumb"></span>
        <span class="reader-skeleton__line reader-skeleton__line--tool"></span>
      </div>
      <div class="reader-skeleton__article">
        <span class="reader-skeleton__line reader-skeleton__line--eyebrow"></span>
        <span class="reader-skeleton__line reader-skeleton__line--title"></span>
        <span class="reader-skeleton__line reader-skeleton__line--title-short"></span>
        <span class="reader-skeleton__line reader-skeleton__line--promise"></span>
        <div class="reader-skeleton__outline">
          @for (row of rows; track row) {
            <span class="reader-skeleton__line reader-skeleton__line--row"></span>
          }
        </div>
        <span class="reader-skeleton__line reader-skeleton__line--body"></span>
        <span class="reader-skeleton__line reader-skeleton__line--body"></span>
        <span class="reader-skeleton__line reader-skeleton__line--body-short"></span>
      </div>
    </div>
  `,
  styleUrl: './reader-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderSkeleton {
  protected readonly rows = [1, 2, 3, 4];
}
