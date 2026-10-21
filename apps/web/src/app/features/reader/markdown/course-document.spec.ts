import { describe, expect, it } from 'vitest';

import { parseCourseDocument } from './course-document';

const COURSE = `# Vector Databases

> A practical guide to similarity search.

**Audience:** software engineers
**Summary:** Learn how vectors are stored and queried.

## 1. Foundations

Embeddings are numeric representations.

### Vectors and distance

Distance measures matter.

## 2. Indexing

Indexes make search fast.

### HNSW

A graph-based index.
`;

describe('parseCourseDocument', () => {
  it('separates the cover from the body and numbers sections', () => {
    const document = parseCourseDocument(COURSE);

    expect(document.coverMarkdown).not.toContain('# Vector Databases');
    expect(document.coverMarkdown).toContain('A practical guide');
    expect(document.bodyMarkdown.startsWith('## 1. Foundations')).toBe(true);
    expect(document.sectionHeadings.map((heading) => heading.label)).toEqual([
      'Foundations',
      'Indexing',
    ]);
    expect(document.sectionHeadings.map((heading) => heading.id)).toEqual([
      'section-1',
      'section-2',
    ]);
    expect(document.headings.map((heading) => heading.level)).toEqual([2, 3, 2, 3]);
    expect(document.headings[1]?.id).toBe('section-1-vectors-and-distance');
  });

  it('does not treat headings inside fences as sections', () => {
    const document = parseCourseDocument(`# Course

\`\`\`md
## Not a section
\`\`\`

## 1. Real section
`);

    expect(document.sectionHeadings).toHaveLength(1);
    expect(document.bodyMarkdown).toContain('## 1. Real section');
  });

  it('falls back to the whole document when no H2 exists', () => {
    const document = parseCourseDocument('# Course\n\nJust a note.\n');

    expect(document.bodyMarkdown).toBe('');
    expect(document.coverMarkdown).toContain('Just a note.');
    expect(document.sectionHeadings).toEqual([]);
  });

  it('uses ordinal ids for unnumbered headings and keeps duplicate ids unique', () => {
    const document = parseCourseDocument(`# Course

## One

## 1. Two

## One
`);

    expect(document.sectionHeadings.map((heading) => heading.id)).toEqual([
      'section-1',
      'section-1-2',
      'section-3',
    ]);
  });

  it('falls back safely when the lexer cannot parse the text', () => {
    const document = parseCourseDocument('# Still readable\n\nPlain text.');

    expect(document.coverMarkdown).toBeTruthy();
  });
});
