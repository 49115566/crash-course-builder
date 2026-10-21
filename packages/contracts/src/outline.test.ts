import { describe, expect, it } from 'vitest';

import {
  MAX_OUTLINE_CHARS,
  OUTLINE_MAX_SECTIONS,
  OUTLINE_MIN_SECTIONS,
  outlineSectionSchema,
  parsedOutlineSchema,
} from './outline.js';

const VALID_OUTLINE = {
  title: 'Vector Databases: A 30-Minute Crash Course',
  cover: {
    promise: 'Choose, build, and operate a vector search system with confidence.',
    audience: 'software engineers',
    summary: 'Embeddings, indexing, retrieval quality, and production trade-offs.',
  },
  sections: [
    { number: 1, title: 'Foundations', bullets: ['Embeddings', 'Similarity metrics'] },
    { number: 2, title: 'Indexing', bullets: ['HNSW', 'Inverted files'] },
  ],
};

describe('outline contracts', () => {
  it('exports usable section limits', () => {
    expect(OUTLINE_MIN_SECTIONS).toBe(2);
    expect(OUTLINE_MAX_SECTIONS).toBe(15);
    expect(MAX_OUTLINE_CHARS).toBeGreaterThan(10_000);
  });

  it('accepts a valid parsed outline', () => {
    expect(parsedOutlineSchema.safeParse(VALID_OUTLINE).success).toBe(true);
  });

  it('accepts a title-only section', () => {
    expect(
      outlineSectionSchema.safeParse({ number: 1, title: 'Foundations', bullets: [] }).success,
    ).toBe(true);
  });

  it('rejects too few or too many sections', () => {
    expect(
      parsedOutlineSchema.safeParse({
        ...VALID_OUTLINE,
        sections: VALID_OUTLINE.sections.slice(0, 1),
      }).success,
    ).toBe(false);

    const tooMany = Array.from({ length: OUTLINE_MAX_SECTIONS + 1 }, (_, index) => ({
      number: index + 1,
      title: `Section ${String(index + 1)}`,
      bullets: ['One'],
    }));

    expect(parsedOutlineSchema.safeParse({ ...VALID_OUTLINE, sections: tooMany }).success).toBe(
      false,
    );
  });

  it('rejects empty titles and bullets', () => {
    expect(
      outlineSectionSchema.safeParse({ number: 1, title: '  ', bullets: ['One'] }).success,
    ).toBe(false);
    expect(outlineSectionSchema.safeParse({ number: 1, title: 'One', bullets: [''] }).success).toBe(
      false,
    );
  });

  it('rejects non-integer or out-of-range section numbers', () => {
    expect(outlineSectionSchema.safeParse({ number: 1.5, title: 'One', bullets: [] }).success).toBe(
      false,
    );
    expect(
      outlineSectionSchema.safeParse({
        number: OUTLINE_MAX_SECTIONS + 1,
        title: 'One',
        bullets: [],
      }).success,
    ).toBe(false);
  });

  it('preserves unknown fields on persisted outlines', () => {
    const parsed = parsedOutlineSchema.parse({
      ...VALID_OUTLINE,
      futureField: 'kept',
      sections: VALID_OUTLINE.sections.map((section) => ({ ...section, futureField: true })),
    });

    expect(parsed).toHaveProperty('futureField', 'kept');
    expect(parsed.sections[0]).toHaveProperty('futureField', true);
  });
});
