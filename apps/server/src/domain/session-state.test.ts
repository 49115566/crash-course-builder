import { describe, expect, it } from 'vitest';

import { createSessionFixture } from '../test/session-fixtures.js';
import {
  canApproveOutline,
  canEditInputs,
  canPause,
  canRegenerateOutline,
  canResume,
  canStartOutline,
  expansionStarted,
  resumeAction,
  toSessionSummary,
} from './session-state.js';

describe('session state machine', () => {
  it('gates outline generation and approval to the right states', () => {
    expect(canStartOutline(createSessionFixture({ status: 'draft' }))).toBe(true);
    expect(canStartOutline(createSessionFixture({ status: 'outline_review' }))).toBe(false);
    expect(canApproveOutline(createSessionFixture({ status: 'outline_review' }))).toBe(true);
    expect(canApproveOutline(createSessionFixture({ status: 'draft' }))).toBe(false);
  });

  it('allows input edits only before or during outline review', () => {
    expect(canEditInputs(createSessionFixture({ status: 'draft' }))).toBe(true);
    expect(canEditInputs(createSessionFixture({ status: 'outline_review' }))).toBe(true);
    expect(canEditInputs(createSessionFixture({ status: 'expanding' }))).toBe(false);
    expect(canEditInputs(createSessionFixture({ status: 'failed' }))).toBe(false);
  });

  it('blocks regeneration once expansion starts', () => {
    expect(canRegenerateOutline(createSessionFixture({ status: 'outline_review' }))).toBe(true);
    expect(canRegenerateOutline(createSessionFixture({ status: 'failed', stage: 'outline' }))).toBe(
      true,
    );
    expect(
      canRegenerateOutline(createSessionFixture({ status: 'failed', stage: 'sections' })),
    ).toBe(false);
    expect(expansionStarted(createSessionFixture({ status: 'paused', stage: 'sections' }))).toBe(
      true,
    );
    expect(expansionStarted(createSessionFixture({ status: 'paused', stage: 'outline' }))).toBe(
      false,
    );
  });

  it('maps paused and failed sessions to the right resume action', () => {
    expect(resumeAction(createSessionFixture({ status: 'paused', stage: 'outline' }))).toBe(
      'outline',
    );
    expect(resumeAction(createSessionFixture({ status: 'failed', stage: 'sections' }))).toBe(
      'sections',
    );
    expect(resumeAction(createSessionFixture({ status: 'paused', stage: 'finalization' }))).toBe(
      'finalization',
    );
    expect(resumeAction(createSessionFixture({ status: 'completed' }))).toBeNull();
    expect(canResume(createSessionFixture({ status: 'paused' }))).toBe(true);
    expect(canResume(createSessionFixture({ status: 'expanding' }))).toBe(false);
  });

  it('only pauses or stops active sessions', () => {
    expect(canPause(createSessionFixture({ status: 'generating_outline' }))).toBe(true);
    expect(canPause(createSessionFixture({ status: 'expanding' }))).toBe(true);
    expect(canPause(createSessionFixture({ status: 'paused' }))).toBe(false);
  });

  it('builds summaries with progress', () => {
    const session = createSessionFixture({
      status: 'expanding',
      stage: 'sections',
      sections: [
        {
          number: 1,
          title: 'One',
          bullets: [],
          wordBudget: 500,
          prompt: {
            version: '1',
            sectionNumber: 1,
            sectionTitle: 'One',
            wordBudget: 500,
            system: 's',
            user: 'u',
            estimatedTokens: 1,
          },
          status: 'completed',
        },
      ],
    });
    const summary = toSessionSummary(session);

    expect(summary).toMatchObject({
      status: 'expanding',
      sectionCount: 1,
      completedSections: 1,
      topic: 'Vector Databases',
    });
  });
});
