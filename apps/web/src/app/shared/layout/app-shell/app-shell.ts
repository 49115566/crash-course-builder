import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { startWith } from 'rxjs';

import { HealthService } from '../../../core/api/health.service';

const LOADING_HEALTH = { state: 'loading' } as const;

@Component({
  selector: 'ccb-app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly healthService = inject(HealthService);

  protected readonly health = toSignal(
    this.healthService.getHealth().pipe(startWith(LOADING_HEALTH)),
    { initialValue: LOADING_HEALTH },
  );

  protected readonly serviceLabel = computed(() => {
    switch (this.health().state) {
      case 'connected':
        return 'Local service connected';
      case 'unavailable':
        return 'Local service unavailable';
      default:
        return 'Checking local service';
    }
  });

  protected readonly version = computed(() => {
    const health = this.health();
    return health.state === 'connected' ? health.data.version : null;
  });
}
