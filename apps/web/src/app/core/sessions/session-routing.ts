import type { SessionData, SessionStage, SessionStatus, SessionSummary } from '@ccb/contracts';

export type WizardStep = 'details' | 'prompts' | 'outline' | 'write';

type SessionProgress = {
  id?: string;
  status: SessionStatus;
  stage?: SessionStage;
  outline?: unknown;
};

export function stepForSession(session: SessionProgress): WizardStep {
  if (session.status === 'draft') return 'prompts';
  if (session.status === 'generating_outline' || session.status === 'outline_review') {
    return 'outline';
  }

  if (session.status === 'paused' || session.status === 'failed') {
    return session.stage === 'outline' ? 'outline' : 'write';
  }

  return 'write';
}

export function routeForSession(session: SessionProgress): string {
  if (session.id === undefined) return '/courses/new';

  return `/courses/new/${session.id}/${stepForSession(session)}`;
}

export function routeForSummary(summary: SessionSummary): string {
  return routeForSession(summary);
}

export function isOutlineStepAllowed(session: SessionData): boolean {
  if (session.status === 'generating_outline' || session.status === 'outline_review') {
    return true;
  }

  if ((session.status === 'paused' || session.status === 'failed') && session.stage === 'outline') {
    return true;
  }

  return (
    session.outline !== undefined &&
    (session.status === 'expanding' ||
      session.status === 'paused' ||
      session.status === 'failed' ||
      session.status === 'completed')
  );
}

export function expansionStarted(session: Pick<SessionData, 'status' | 'stage'>): boolean {
  return (
    session.stage === 'sections' ||
    session.stage === 'finalization' ||
    session.status === 'expanding' ||
    session.status === 'completed'
  );
}

export function canRegenerateOutline(session: Pick<SessionData, 'status' | 'stage'>): boolean {
  return (
    session.status === 'outline_review' ||
    (session.status === 'failed' && session.stage === 'outline')
  );
}

export function sessionStatusLabel(session: Pick<SessionData, 'status' | 'stage'>): string {
  switch (session.status) {
    case 'draft':
      return 'Draft';
    case 'generating_outline':
      return 'Writing outline';
    case 'outline_review':
      return 'Outline ready';
    case 'expanding':
      return session.stage === 'finalization' ? 'Saving course' : 'Writing';
    case 'completed':
      return 'Complete';
    case 'paused':
      return 'Paused';
    case 'failed':
      return 'Paused — needs attention';
  }
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function sessionStatusTone(session: Pick<SessionData, 'status'>): StatusTone {
  switch (session.status) {
    case 'draft':
      return 'neutral';
    case 'generating_outline':
    case 'outline_review':
    case 'expanding':
      return 'accent';
    case 'completed':
      return 'success';
    case 'paused':
      return 'warning';
    case 'failed':
      return 'danger';
  }
}

export function sessionActionLabel(summary: SessionSummary): string {
  if (summary.status === 'draft') return 'Continue setup';
  if (summary.status === 'generating_outline') return 'Watch outline';
  if (summary.status === 'outline_review') return 'Review outline';
  if (summary.status === 'expanding') {
    return summary.stage === 'finalization' ? 'View progress' : 'Watch progress';
  }
  if (summary.status === 'completed') return 'View course';
  return 'Resume';
}

export function pauseReasonCopy(
  summary: Pick<SessionSummary, 'pauseReason' | 'status'>,
): string | null {
  if (summary.status !== 'paused') return null;
  if (summary.pauseReason === 'interrupted') {
    return 'The app restarted while this course was being written. Completed sections were kept.';
  }
  if (summary.pauseReason === 'stop') {
    return 'Writing was stopped. The unfinished section was discarded; completed sections were kept.';
  }
  if (summary.pauseReason === 'user') {
    return 'Paused after the last completed section. Resume whenever you are ready.';
  }
  return null;
}
