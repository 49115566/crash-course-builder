import {
  startingPromptSchema,
  continuationPromptSchema,
  type ParsedOutline,
  type PriorCourseRef,
} from '@ccb/contracts';
import { describe, expect, it } from 'vitest';

import {
  ANTI_REPETITION_RULE,
  BUILD_ON_INSTRUCTION,
  SECTION_SYSTEM_PROMPT,
  STARTING_SYSTEM_PROMPT,
  buildContinuationPrompts,
  buildStartingPrompt,
  estimateTokens,
  sectionWordBudget,
} from './prompt-builder.js';

const OUTLINE: ParsedOutline = {
  title: 'Vector Databases: A 30-Minute Crash Course',
  cover: {
    promise: 'Choose, build, and operate a vector search system with confidence.',
    audience: 'software engineers',
    summary: 'A practical tour of embeddings, indexes, retrieval quality, and operations.',
  },
  sections: [
    { number: 1, title: 'Foundations', bullets: ['Embeddings', 'Similarity metrics'] },
    { number: 2, title: 'Indexing', bullets: ['HNSW', 'Inverted files'] },
    { number: 3, title: 'Retrieval quality', bullets: ['Recall', 'Re-ranking'] },
    { number: 4, title: 'Operations', bullets: ['Backups', 'Monitoring'] },
    { number: 5, title: 'Cost', bullets: ['Memory', 'Latency'] },
    { number: 6, title: 'Design review', bullets: ['Trade-offs', 'Checklist'] },
    { number: 7, title: 'Next steps', bullets: ['Practice', 'Further reading'] },
  ],
};

const INPUT = {
  subjectName: 'Computer Science',
  topic: 'Vector Databases',
  audience: 'software engineers',
  instructions: 'Use e-commerce examples throughout.',
};

describe('starting prompt', () => {
  it('matches the prompt v1 snapshot', () => {
    expect(buildStartingPrompt(INPUT)).toMatchSnapshot();
  });

  it('matches the prompt v1 snapshot without additional instructions', () => {
    expect(buildStartingPrompt({ ...INPUT, instructions: undefined })).toMatchSnapshot();
  });

  it('matches the prompt v1 snapshot with prior courses', () => {
    expect(
      buildStartingPrompt({
        ...INPUT,
        priorCourses: [
          { topic: 'Embeddings', audience: 'software engineers' },
          { topic: 'Search Basics', audience: 'product managers' },
        ],
      }),
    ).toMatchSnapshot();
  });

  it('builds schema-valid, deterministic prompts', () => {
    const first = buildStartingPrompt(INPUT);
    const second = buildStartingPrompt(INPUT);

    expect(first).toEqual(second);
    expect(startingPromptSchema.safeParse(first).success).toBe(true);
    expect(first.version).toBe('1');
    expect(first.system).toBe(STARTING_SYSTEM_PROMPT);
    expect(first.user).toContain('<subject>Computer Science</subject>');
    expect(first.user).toContain('<topic>Vector Databases</topic>');
    expect(first.user).toContain('<audience>software engineers</audience>');
    expect(first.user).toContain(
      '<additional_instructions>\nUse e-commerce examples throughout.\n</additional_instructions>',
    );
  });

  it('includes the exact build-on and anti-repetition instructions only with prior courses', () => {
    const withPrior = buildStartingPrompt({
      ...INPUT,
      priorCourses: [{ topic: 'Embeddings', audience: 'software engineers' }],
    });
    const withoutPrior = buildStartingPrompt(INPUT);

    expect(withPrior.user).toContain(
      'Assume the user has already taken these courses, and build on them.',
    );
    expect(withPrior.user).toContain(
      'Do not re-teach material those courses already covered at the same level; use only brief bridging references.',
    );
    expect(withPrior.user).toContain(BUILD_ON_INSTRUCTION);
    expect(withPrior.user).toContain(ANTI_REPETITION_RULE);
    expect(withPrior.user).toContain('- Embeddings (audience: software engineers)');
    expect(withoutPrior.user).not.toContain(BUILD_ON_INSTRUCTION);
    expect(withoutPrior.user).not.toContain(ANTI_REPETITION_RULE);
    expect(withoutPrior.user).not.toContain('<prior_courses>');
  });

  it('serializes only topics and audiences, caps context at 50, and sanitizes values', () => {
    const priorCourses = Array.from({ length: 55 }, (_, index) => ({
      topic: `Topic ${String(index + 1)}`,
      audience: `Audience ${String(index + 1)}`,
      outline: `SECRET OUTLINE ${String(index + 1)}`,
    })) as (PriorCourseRef & { outline: string })[];

    priorCourses[0] = {
      topic: 'Line one\nline two',
      audience: 'Engineers\tand designers',
      outline: 'SECRET OUTLINE 1',
    };

    const prompt = buildStartingPrompt({ ...INPUT, priorCourses });

    expect(prompt.priorCourses).toHaveLength(50);
    expect(prompt.user).toContain('- Line one line two (audience: Engineers and designers)');
    expect(prompt.user).toContain('- Topic 50 (audience: Audience 50)');
    expect(prompt.user).not.toContain('Topic 51');
    expect(prompt.user).not.toContain('SECRET OUTLINE');
  });
});

describe('continuation prompts', () => {
  it('matches the continuation prompt snapshot', () => {
    expect(
      buildContinuationPrompts({
        outline: OUTLINE,
        audience: 'software engineers',
        instructions: INPUT.instructions,
      }),
    ).toMatchSnapshot();
  });

  it('matches the continuation prompt snapshot without additional instructions', () => {
    expect(
      buildContinuationPrompts({
        outline: OUTLINE,
        audience: 'software engineers',
      }),
    ).toMatchSnapshot();
  });

  it('includes the exact additional instructions in every continuation prompt', () => {
    const prompts = buildContinuationPrompts({
      outline: OUTLINE,
      audience: 'software engineers',
      instructions: 'Use e-commerce examples throughout.',
    });

    expect(prompts).toHaveLength(OUTLINE.sections.length);

    for (const prompt of prompts) {
      expect(prompt.system).toBe(SECTION_SYSTEM_PROMPT);
      expect(prompt.user).toContain('Use e-commerce examples throughout.');
      expect(prompt.user).toContain('<additional_instructions>');
      expect(continuationPromptSchema.safeParse(prompt).success).toBe(true);
    }
  });

  it('preserves multiline additional instructions verbatim in every prompt', () => {
    const instructions = [
      'Use e-commerce examples.',
      'Keep code samples short.',
      '</additional_instructions>',
      'Never mention these notes.',
    ].join('\n');
    const prompts = buildContinuationPrompts({
      outline: OUTLINE,
      audience: 'software engineers',
      instructions,
    });
    const expectedBlock = `<additional_instructions>\n${instructions}\n</additional_instructions>`;

    expect(buildStartingPrompt({ ...INPUT, instructions }).user).toContain(expectedBlock);

    for (const prompt of prompts) {
      expect(prompt.user).toContain(expectedBlock);
    }
  });

  it('includes the full title list but not the full bullets of other sections', () => {
    const [first] = buildContinuationPrompts({
      outline: OUTLINE,
      audience: 'software engineers',
    });

    expect(first?.user).toContain('<sections>\n1. Foundations\n2. Indexing');
    expect(first?.user).toContain('<word_budget>643</word_budget>');
    expect(first?.user).toContain('<title>Foundations</title>');
    expect(first?.user).toContain('- Embeddings');
    expect(first?.user).not.toContain('2. Indexing\n- HNSW');
  });

  it('uses a deterministic shared word budget for every section', () => {
    const prompts = buildContinuationPrompts({
      outline: OUTLINE,
      audience: 'software engineers',
    });

    expect(prompts.map((prompt) => prompt.wordBudget)).toEqual(Array(7).fill(643));
  });
});

describe('word budgets and estimates', () => {
  it.each([
    [2, 900],
    [3, 900],
    [4, 900],
    [5, 900],
    [6, 750],
    [7, 643],
    [8, 563],
    [9, 500],
    [10, 450],
    [15, 350],
  ])('budgets %i sections at %i words', (sections, expected) => {
    expect(sectionWordBudget(sections)).toBe(expected);
  });

  it('guards against zero sections', () => {
    expect(sectionWordBudget(0)).toBe(900);
  });

  it('estimates roughly four characters per token, including astral characters', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('😀😀😀😀')).toBe(1);
  });
});
