import { describe, expect, it } from 'vitest';

import {
  canRegenerateOutline,
  expansionStarted,
  routeForSummary,
  sessionActionLabel,
  sessionStatusLabel,
  stepForSession,
} from './session-routing';
import {
  makeDraftSession,
  makeOutlineSession,
  makeWritingSession,
  summaryOf,
} from '../../testing/session-fixtures';

describe('session routing', () => {
  it('maps every session state to the right wizard step', () => {
    expect(stepForSession(makeDraftSession())).toBe('prompts');
    expect(stepForSession(makeDraftSession({ status: 'generating_outline' }))).toBe('outline');
    expect(stepForSession(makeOutlineSession())).toBe('outline');
    expect(stepForSession(makeWritingSession())).toBe('write');
    expect(stepForSession(makeDraftSession({ status: 'paused', stage: 'outline' }))).toBe(
      'outline',
    );
    expect(stepForSession(makeDraftSession({ status: 'failed', stage: 'sections' }))).toBe('write');
    expect(stepForSession(makeDraftSession({ status: 'completed' }))).toBe('write');
  });

  it('routes summaries to resumable URLs', () => {
    const summary = summaryOf(makeOutlineSession());
    expect(routeForSummary(summary)).toBe(`/courses/new/${summary.id}/outline`);
  });

  it('recognises expansion and regeneration gates', () => {
    expect(expansionStarted(makeOutlineSession())).toBe(false);
    expect(expansionStarted(makeWritingSession())).toBe(true);
    expect(canRegenerateOutline(makeOutlineSession())).toBe(true);
    expect(canRegenerateOutline(makeWritingSession())).toBe(false);
    expect(canRegenerateOutline(makeDraftSession({ status: 'failed', stage: 'outline' }))).toBe(
      true,
    );
  });

  it('provides clear labels and library actions', () => {
    expect(sessionStatusLabel(makeDraftSession({ status: 'failed', stage: 'sections' }))).toBe(
      'Paused — needs attention',
    );
    expect(sessionActionLabel(summaryOf(makeOutlineSession()))).toBe('Review outline');
    expect(sessionActionLabel(summaryOf(makeDraftSession()))).toBe('Continue setup');
  });
});
