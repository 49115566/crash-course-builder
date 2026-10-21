import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Skeleton } from '../../../shared/ui/skeleton/skeleton';

@Component({
  selector: 'ccb-library-skeleton',
  imports: [Skeleton],
  template: `
    <div class="skeleton-stack" aria-busy="true">
      <span class="ccb-visually-hidden">Loading your library</span>
      @for (item of [1, 2]; track item) {
        <div class="skeleton-subject">
          <div class="skeleton-subject__heading">
            <ccb-skeleton width="13rem" height="1.5rem" />
            <ccb-skeleton width="5rem" height="0.8rem" />
          </div>
          <div class="skeleton-subject__cards">
            @for (card of [1, 2, 3]; track card) {
              <div class="skeleton-card">
                <ccb-skeleton width="35%" height="0.65rem" />
                <ccb-skeleton width="90%" height="1.1rem" />
                <ccb-skeleton width="70%" height="1.1rem" />
                <ccb-skeleton width="50%" height="0.8rem" />
                <ccb-skeleton width="100%" height="0.1rem" />
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './library-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibrarySkeleton {}
