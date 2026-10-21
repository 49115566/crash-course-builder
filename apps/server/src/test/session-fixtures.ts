import type { SessionData } from '@ccb/contracts';

import { FAKE_OUTLINE_MARKDOWN } from '../adapters/fake-ai/fixtures.js';
import { parseOutline } from '../domain/outline-parser.js';
import { buildContinuationPrompts, buildStartingPrompt } from '../domain/prompt-builder.js';

export const SESSION_IDS = {
  session: '123e4567-e89b-42d3-a456-426614174020',
  course: '123e4567-e89b-42d3-a456-426614174021',
  subject: '123e4567-e89b-42d3-a456-426614174001',
} as const;

export function createSessionFixture(overrides: Partial<SessionData> = {}): SessionData {
  const input = {
    topic: 'Vector Databases',
    audience: 'software engineers',
    instructions: 'Use practical examples.',
  };
  const startingPrompt = buildStartingPrompt({
    subjectName: 'Computer Science',
    ...input,
    priorCourses: [],
  });

  return {
    schemaVersion: 1,
    id: SESSION_IDS.session,
    status: 'draft',
    subject: { id: SESSION_IDS.subject, name: 'Computer Science' },
    input,
    priorCourses: [],
    startingPrompt,
    continuations: [],
    sections: [],
    courseId: SESSION_IDS.course,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

export function createReviewSessionFixture(overrides: Partial<SessionData> = {}): SessionData {
  const base = createSessionFixture();
  const outline = parseOutline(FAKE_OUTLINE_MARKDOWN, {
    fallbackTitle: base.input.topic,
    fallbackAudience: base.input.audience,
  });
  const continuations = buildContinuationPrompts({
    outline,
    audience: base.input.audience,
    instructions: base.input.instructions,
  });

  return {
    ...base,
    status: 'outline_review',
    outlineRaw: FAKE_OUTLINE_MARKDOWN,
    outline,
    continuations,
    sections: outline.sections.map((section) => {
      const prompt = continuations.find((entry) => entry.sectionNumber === section.number);

      if (prompt === undefined) throw new Error('Missing continuation prompt fixture.');

      return {
        number: section.number,
        title: section.title,
        bullets: section.bullets,
        wordBudget: prompt.wordBudget,
        prompt,
        status: 'pending' as const,
      };
    }),
    updatedAt: '2026-01-02T01:00:00.000Z',
    ...overrides,
  };
}

export async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  let last = await read();

  while (!predicate(last)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 10));
    last = await read();
  }

  return last;
}
