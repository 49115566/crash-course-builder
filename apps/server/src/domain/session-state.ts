import type { SessionData, SessionStage, SessionStatus, SessionSummary } from '@ccb/contracts';

export type ResumeAction = 'outline' | 'sections' | 'finalization';

export const ACTIVE_SESSION_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'generating_outline',
  'expanding',
]);

export function isActiveSession(session: Pick<SessionData, 'status'>): boolean {
  return ACTIVE_SESSION_STATUSES.has(session.status);
}

export function isInProgressSession(session: Pick<SessionData, 'status'>): boolean {
  return session.status !== 'completed';
}

export function canStartOutline(session: Pick<SessionData, 'status'>): boolean {
  return session.status === 'draft';
}

export function canApproveOutline(session: Pick<SessionData, 'status'>): boolean {
  return session.status === 'outline_review';
}

export function canEditInputs(session: Pick<SessionData, 'status'>): boolean {
  return session.status === 'draft' || session.status === 'outline_review';
}

export function canPause(session: Pick<SessionData, 'status'>): boolean {
  return isActiveSession(session);
}

export function canStop(session: Pick<SessionData, 'status'>): boolean {
  return isActiveSession(session);
}

export function canResume(session: Pick<SessionData, 'status'>): boolean {
  return session.status === 'paused' || session.status === 'failed';
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

export function resumeAction(session: Pick<SessionData, 'status' | 'stage'>): ResumeAction | null {
  if (!canResume(session)) {
    return null;
  }

  if (session.stage === 'sections') return 'sections';
  if (session.stage === 'finalization') return 'finalization';
  return 'outline';
}

export function stageForStatus(status: SessionStatus, stage: SessionStage | undefined): string {
  if (status === 'generating_outline') return 'Generating outline';
  if (status === 'outline_review') return 'Review outline';
  if (status === 'expanding') return stage === 'finalization' ? 'Saving course' : 'Writing course';
  if (status === 'completed') return 'Complete';
  if (status === 'failed') return 'Paused — needs attention';
  if (status === 'paused') return 'Paused';
  return 'Draft';
}

export function toSessionSummary(session: SessionData): SessionSummary {
  const completedSections = session.sections.filter(
    (section) => section.status === 'completed',
  ).length;

  return {
    id: session.id,
    status: session.status,
    ...(session.stage === undefined ? {} : { stage: session.stage }),
    subject: session.subject,
    topic: session.input.topic,
    audience: session.input.audience,
    ...(session.outline === undefined ? {} : { title: session.outline.title }),
    sectionCount: session.sections.length,
    completedSections,
    ...(session.activeSectionNumber === undefined
      ? {}
      : { activeSectionNumber: session.activeSectionNumber }),
    courseId: session.courseId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.pauseReason === undefined ? {} : { pauseReason: session.pauseReason }),
    ...(session.lastError === undefined ? {} : { lastError: session.lastError }),
    ...(session.savedPath === undefined ? {} : { savedPath: session.savedPath }),
  };
}
