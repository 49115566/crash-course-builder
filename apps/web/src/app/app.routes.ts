import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/library/library.routes').then((m) => m.LIBRARY_ROUTES),
  },
  {
    path: 'courses/new',
    loadChildren: () => import('./features/wizard/wizard.routes').then((m) => m.WIZARD_ROUTES),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
