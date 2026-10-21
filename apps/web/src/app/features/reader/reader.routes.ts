import type { Routes } from '@angular/router';

import { READER_MARKDOWN_PROVIDERS } from './markdown/reader-markdown.config';

export const READER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./reader.page').then((module) => module.ReaderPage),
    providers: [...READER_MARKDOWN_PROVIDERS],
    title: 'Course — Crash Course Builder',
  },
];
