import { describe, expect, it } from 'vitest';

import {
  continuationPromptSchema,
  priorCourseSchema,
  promptPreviewSchema,
  startingPromptSchema,
} from './prompts.js';

const STARTING_PROMPT = {
  version: '1',
  system: 'You are an expert curriculum designer.',
  user: 'Create a crash course outline about vector databases.',
  priorCourses: [{ topic: 'Embeddings', audience: 'software engineers' }],
  estimatedTokens: 120,
};

const CONTINUATION_PROMPT = {
  version: '1',
  sectionNumber: 2,
  sectionTitle: 'Indexing',
  wordBudget: 750,
  system: 'You are an expert technical writer.',
  user: 'Write section 2.',
  estimatedTokens: 90,
};

describe('prompt contracts', () => {
  it('accepts valid starting and continuation prompts', () => {
    expect(startingPromptSchema.safeParse(STARTING_PROMPT).success).toBe(true);
    expect(continuationPromptSchema.safeParse(CONTINUATION_PROMPT).success).toBe(true);
  });

  it('accepts a complete prompt preview', () => {
    expect(
      promptPreviewSchema.safeParse({
        starting: STARTING_PROMPT,
        continuations: [CONTINUATION_PROMPT],
      }).success,
    ).toBe(true);
  });

  it('trims prior-course context and rejects unknown fields', () => {
    const parsed = priorCourseSchema.parse({
      topic: '  Embeddings  ',
      audience: '  software engineers  ',
    });

    expect(parsed).toEqual({ topic: 'Embeddings', audience: 'software engineers' });
    expect(priorCourseSchema.safeParse({ ...parsed, outline: '# Secret' }).success).toBe(false);
  });

  it('rejects malformed word budgets', () => {
    expect(
      continuationPromptSchema.safeParse({ ...CONTINUATION_PROMPT, wordBudget: 349 }).success,
    ).toBe(false);
    expect(
      continuationPromptSchema.safeParse({ ...CONTINUATION_PROMPT, wordBudget: 901 }).success,
    ).toBe(false);
    expect(
      continuationPromptSchema.safeParse({ ...CONTINUATION_PROMPT, wordBudget: 500.5 }).success,
    ).toBe(false);
  });

  it('rejects a mismatched prompt version', () => {
    expect(startingPromptSchema.safeParse({ ...STARTING_PROMPT, version: '2' }).success).toBe(
      false,
    );
  });

  it('rejects empty messages', () => {
    expect(startingPromptSchema.safeParse({ ...STARTING_PROMPT, system: '' }).success).toBe(false);
  });
});
