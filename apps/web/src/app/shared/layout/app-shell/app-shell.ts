import { DOCUMENT } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, startWith } from 'rxjs';

import { HealthService } from '../../../core/api/health.service';
import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { KeyBanner } from '../key-banner/key-banner';
import { ToastOutlet } from '../../ui/toast/toast-outlet';

const LOADING_HEALTH = { state: 'loading' } as const;

@Component({
  selector: 'ccb-app-shell',
  imports: [KeyBanner, RouterLink, RouterLinkActive, RouterOutlet, ToastOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  private readonly healthService = inject(HealthService);
  private readonly bootstrap = inject(BootstrapStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    void this.bootstrap.load();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const title = this.document.title;
        if (title.length > 0) {
          void this.announcer.announce(title, 'polite');
        }
      });
  }

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
