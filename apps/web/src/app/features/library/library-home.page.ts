import { ChangeDetectionStrategy, Component } from '@angular/core';

import { BadgeDirective } from '../../shared/ui/badge/badge.directive';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';

@Component({
  selector: 'ccb-library-home',
  imports: [BadgeDirective, EmptyState],
  templateUrl: './library-home.page.html',
  styleUrl: './library-home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryHomePage {}
