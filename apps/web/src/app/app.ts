import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AppShell } from './shared/layout/app-shell/app-shell';

@Component({
  selector: 'ccb-root',
  imports: [AppShell],
  template: '<ccb-app-shell />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
