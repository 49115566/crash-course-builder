import { MAX_OUTLINE_CHARS } from '@ccb/contracts';
import { describe, expect, it } from 'vitest';

import {
  ADVERSARIAL_OUTLINE_MARKDOWN,
  DUPLICATE_TITLES_MARKDOWN,
  FALLBACK_OUTLINE_MARKDOWN,
  FENCED_OUTLINE_MARKDOWN,
  H3_OUTLINE_MARKDOWN,
  MALFORMED_OUTLINE_MARKDOWN,
  SIXTEEN_SECTIONS_MARKDOWN,
  TOC_OUTLINE_MARKDOWN,
  UNICODE_OUTLINE_MARKDOWN,
  VALID_OUTLINE_MARKDOWN,
} from '../test/outline-fixtures.js';
import { OutlineError } from './outline-errors.js';
import { parseOutline, type ParseOutlineOptions } from './outline-parser.js';

const OPTIONS: ParseOutlineOptions = {
  fallbackTitle: 'Fallback Topic',
  fallbackAudience: 'curious readers',
};

function expectOutlineError(raw: string): OutlineError {
  try {
    parseOutline(raw, OPTIONS);
  } catch (error) {
    expect(error).toBeInstanceOf(OutlineError);
    return error as OutlineError;
  }

  throw new Error('Expected parseOutline to throw');
}

describe('parseOutline', () => {
  it('parses a complete outline with a cover and numbered sections', () => {
    const outline = parseOutline(VALID_OUTLINE_MARKDOWN, OPTIONS);

    expect(outline.title).toBe('Vector Databases: A 30-Minute Crash Course');
    expect(outline.cover).toEqual({
      promise: 'Choose, build, and operate a vector search system with confidence.',
      audience: 'software engineers',
      summary:
        'This course explains embeddings, indexing, retrieval quality, and the operational trade-offs that matter in production.',
    });
    expect(outline.sections).toHaveLength(7);
    expect(outline.sections[0]).toEqual({
      number: 1,
      title: 'Foundations',
      bullets: [
        'What an embedding represents',
        'Similarity metrics such as $\\cos(\\theta)$',
        'When vector search is the right tool',
      ],
    });
    expect(outline.sections[6]?.title).toBe('Putting it together');
  });

  it('unwraps an outline delivered inside one Markdown fence', () => {
    const outline = parseOutline(FENCED_OUTLINE_MARKDOWN, OPTIONS);

    expect(outline.sections).toHaveLength(7);
    expect(outline.title).toBe('Vector Databases: A 30-Minute Crash Course');
  });

  it('ignores a separate table of contents and its link list', () => {
    const outline = parseOutline(TOC_OUTLINE_MARKDOWN, OPTIONS);

    expect(outline.sections.map((section) => section.title)).toEqual([
      'Foundations',
      'Retrieval',
      'Evaluation',
    ]);
    expect(outline.sections.flatMap((section) => section.bullets)).not.toContain('Foundations');
  });

  it('falls back to a numbered list when no H2 headings exist', () => {
    const outline = parseOutline(FALLBACK_OUTLINE_MARKDOWN, OPTIONS);

    expect(outline.title).toBe('Observability for Small Teams');
    expect(outline.sections).toEqual([
      {
        number: 1,
        title: 'Signals',
        bullets: ['Logs, metrics, and traces', 'Choosing what to measure'],
      },
      {
        number: 2,
        title: 'Instrumentation',
        bullets: ['Structured logging', 'Tracing boundaries'],
      },
      {
        number: 3,
        title: 'Alerting',
        bullets: ['Symptom-based alerts', 'Runbooks'],
      },
    ]);
  });

  it('uses H3 headings as bullets when a section has no list', () => {
    const outline = parseOutline(H3_OUTLINE_MARKDOWN, OPTIONS);

    expect(outline.sections[0]?.bullets).toEqual(['Defining tracks', 'Placing items']);
    expect(outline.sections[1]?.bullets).toEqual(['Main and cross axes', 'Wrapping and alignment']);
  });

  it('normalizes Unicode without losing meaning', () => {
    const outline = parseOutline(UNICODE_OUTLINE_MARKDOWN, OPTIONS);

    expect(outline.title).toBe('Café ☕ — Données vectorielles');
    expect(outline.cover.audience).toBe('ingénieurs logiciels');
    expect(outline.sections.map((section) => section.title)).toEqual(['Fondations', 'Indexation']);
  });

  it('normalizes various section numbering styles', () => {
    const outline = parseOutline(
      `# Numbering

## Section 1: Foundations
- A
## 02) Indexing
- B
## 3 — Retrieval
- C
`,
      OPTIONS,
    );

    expect(outline.sections.map((section) => section.title)).toEqual([
      'Foundations',
      'Indexing',
      'Retrieval',
    ]);
  });

  it('drops empty bullets and deduplicates repeated bullets', () => {
    const outline = parseOutline(
      `# Bullets

## 1. One
- Useful
- Useful
- ![remote](https://example.test/a.png)
- <script>alert(1)</script>
- Also useful

## 2. Two
- Another point
`,
      OPTIONS,
    );

    expect(outline.sections[0]?.bullets).toEqual(['Useful', 'Also useful']);
  });

  it('uses the fallback title when the outline has no H1', () => {
    const outline = parseOutline(
      `## 1. Foundations
- A
## 2. Indexing
- B
`,
      OPTIONS,
    );

    expect(outline.title).toBe('Fallback Topic');
  });

  it('falls back to prose for the summary when no label is present', () => {
    const outline = parseOutline(
      `# A Course

A short paragraph that describes the course.

## 1. One
- A
## 2. Two
- B
`,
      OPTIONS,
    );

    expect(outline.cover.summary).toBe('A short paragraph that describes the course.');
    expect(outline.cover.audience).toBe('curious readers');
  });

  it('strips scripts, images, and Mermaid from adversarial outlines', () => {
    const outline = parseOutline(ADVERSARIAL_OUTLINE_MARKDOWN, OPTIONS);
    const serialized = JSON.stringify(outline);

    expect(outline.sections).toHaveLength(3);
    expect(outline.sections[0]?.bullets).toContain('Validate links before rendering');
    expect(serialized).not.toContain('<script');
    expect(serialized).not.toContain('example.test/chart.png');
    expect(serialized).not.toContain('graph TD');
  });

  it('accepts the minimum and maximum section counts', () => {
    const two = parseOutline(
      `# Two

## 1. One
- A
## 2. Two
- B
`,
      OPTIONS,
    );
    expect(two.sections).toHaveLength(2);

    const fifteenSections = Array.from({ length: 15 }, (_, index) => {
      return `## ${String(index + 1)}. Section ${String(index + 1)}\n- Point`;
    }).join('\n');

    expect(parseOutline(`# Fifteen\n\n${fifteenSections}`, OPTIONS).sections).toHaveLength(15);
  });

  it('truncates very long titles within the contract limit', () => {
    const longTitle = 'word '.repeat(80).trim();
    const outline = parseOutline(
      `# ${longTitle}

## 1. Foundations
- A
## 2. Indexing
- B
`,
      OPTIONS,
    );

    expect(outline.title.length).toBeLessThanOrEqual(200);
    expect(outline.title.endsWith('…')).toBe(true);
  });

  it('rejects an empty response', () => {
    const error = expectOutlineError('   ');

    expect(error.issues[0]?.code).toBe('EMPTY');
  });

  it('rejects an outline with too few sections', () => {
    const error = expectOutlineError('# One\n\n## 1. Only\n- A');

    expect(error.issues[0]?.code).toBe('TOO_FEW_SECTIONS');
    expect(error.message).toContain('Regenerate');
  });

  it('rejects an outline with too many sections', () => {
    const error = expectOutlineError(SIXTEEN_SECTIONS_MARKDOWN);

    expect(error.issues[0]?.code).toBe('TOO_MANY_SECTIONS');
  });

  it('rejects duplicate section titles after normalization', () => {
    const error = expectOutlineError(DUPLICATE_TITLES_MARKDOWN);

    expect(error.code).toBe('OUTLINE_INVALID');
    expect(error.issues[0]?.code).toBe('DUPLICATE_TITLE');
    expect(error.message).toContain('Foundations');
  });

  it('rejects a prose-only response with no sections', () => {
    const error = expectOutlineError(MALFORMED_OUTLINE_MARKDOWN);

    expect(error.issues[0]?.code).toBe('UNPARSEABLE');
    expect(error.message).toContain('numbered sections');
  });

  it('rejects a table of contents with no real sections', () => {
    const error = expectOutlineError(
      `# Empty\n\n## Table of Contents\n- [Foundations](#foundations)\n`,
    );

    expect(error.issues[0]?.code).toBe('TOO_FEW_SECTIONS');
  });

  it('rejects an H2 heading without a title', () => {
    const error = expectOutlineError(
      `# Empty heading\n\n##\n- A\n\n## 1. Foundations\n- A\n\n## 2. Indexing\n- B\n`,
    );

    expect(error.issues[0]?.code).toBe('EMPTY_TITLE');
  });

  it('rejects oversized outline responses before lexing', () => {
    const error = expectOutlineError('x'.repeat(MAX_OUTLINE_CHARS + 1));

    expect(error.issues[0]?.code).toBe('TOO_LARGE');
  });
});
