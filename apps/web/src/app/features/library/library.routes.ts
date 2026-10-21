import type { Routes } from '@angular/router';

export const LIBRARY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./library-home.page').then((module) => module.LibraryHomePage),
    title: 'Your library — Crash Course Builder',
  },
];
