import type { CanActivateFn, Routes, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  isOutlineStepAllowed,
  routeForSession,
  type WizardStep,
} from '../../core/sessions/session-routing';
import { SessionWizardStore } from './wizard.store';
import { WizardLayout } from './wizard-layout';

const loadAndRedirect = (expected: WizardStep | 'edit'): CanActivateFn => {
  return async (route): Promise<boolean | UrlTree> => {
    const store = inject(SessionWizardStore);
    const router = inject(Router);
    const sessionId = route.paramMap.get('sessionId');

    if (sessionId === null) {
      return router.createUrlTree(['/courses/new']);
    }

    const loaded = await store.ensureLoaded(sessionId);
    if (!loaded) {
      // The page renders the retryable load error; a not-found session redirects itself.
      return store.loadError()?.code === 'NOT_FOUND' ? router.createUrlTree(['/']) : true;
    }

    const session = store.session();
    if (session === null) return true;

    if (expected === 'edit') {
      return session.status === 'draft' || session.status === 'outline_review'
        ? true
        : router.parseUrl(routeForSession(session));
    }

    if (expected === 'prompts') {
      return session.status === 'draft' ? true : router.parseUrl(routeForSession(session));
    }

    if (expected === 'outline') {
      return isOutlineStepAllowed(session) ? true : router.parseUrl(routeForSession(session));
    }

    const isWrite =
      session.status === 'expanding' ||
      session.status === 'completed' ||
      ((session.status === 'paused' || session.status === 'failed') && session.stage !== 'outline');

    return isWrite ? true : router.parseUrl(routeForSession(session));
  };
};

const resumeRedirect: CanActivateFn = async (route): Promise<boolean | UrlTree> => {
  const store = inject(SessionWizardStore);
  const router = inject(Router);
  const sessionId = route.paramMap.get('sessionId');

  if (sessionId === null) return router.createUrlTree(['/courses/new']);

  const loaded = await store.ensureLoaded(sessionId);
  if (!loaded) {
    return store.loadError()?.code === 'NOT_FOUND' ? router.createUrlTree(['/']) : true;
  }

  const session = store.session();
  return session === null ? true : router.parseUrl(routeForSession(session));
};

export const WIZARD_ROUTES: Routes = [
  {
    path: '',
    component: WizardLayout,
    providers: [SessionWizardStore],
    children: [
      {
        path: '',
        title: 'Course details — Crash Course Builder',
        loadComponent: () => import('./pages/details.page').then((module) => module.DetailsPage),
      },
      {
        path: ':sessionId',
        title: 'Opening course — Crash Course Builder',
        canActivate: [resumeRedirect],
        loadComponent: () =>
          import('./pages/session-redirect.page').then((module) => module.SessionRedirectPage),
      },
      {
        path: ':sessionId/edit',
        title: 'Edit course — Crash Course Builder',
        canActivate: [loadAndRedirect('edit')],
        loadComponent: () => import('./pages/details.page').then((module) => module.DetailsPage),
      },
      {
        path: ':sessionId/prompts',
        title: 'Prompt preview — Crash Course Builder',
        canActivate: [loadAndRedirect('prompts')],
        loadComponent: () => import('./pages/prompts.page').then((module) => module.PromptsPage),
      },
      {
        path: ':sessionId/outline',
        title: 'Review outline — Crash Course Builder',
        canActivate: [loadAndRedirect('outline')],
        loadComponent: () => import('./pages/outline.page').then((module) => module.OutlinePage),
      },
      {
        path: ':sessionId/write',
        title: 'Writing course — Crash Course Builder',
        canActivate: [loadAndRedirect('write')],
        loadComponent: () => import('./pages/write.page').then((module) => module.WritePage),
      },
    ],
  },
];
