import { courseMetadataSchema, type ParsedOutline } from '@ccb/contracts';
import { describe, expect, it } from 'vitest';

import type { CourseIdentity, SectionDraft } from './course.js';
import { CourseAssemblyError } from './course.js';
import { assembleCourse } from './course-assembler.js';
import { countWords } from './word-count.js';

const OUTLINE: ParsedOutline = {
  title: 'Vector Databases: A 30-Minute Crash Course',
  cover: {
    promise: 'Choose, build, and operate a vector search system with confidence.',
    audience: 'software engineers',
    summary: 'A practical tour of embeddings, indexes, and operations.',
  },
  sections: [
    { number: 1, title: 'Foundations', bullets: ['Embeddings', 'Similarity'] },
    { number: 2, title: 'Indexing', bullets: ['HNSW', 'Filters'] },
    { number: 3, title: 'Operations', bullets: ['Backups', 'Monitoring'] },
  ],
};

const IDENTITY: CourseIdentity = {
  id: '123e4567-e89b-42d3-a456-426614174010',
  subject: {
    id: '123e4567-e89b-42d3-a456-42661417400a',
    name: 'Computer Science',
  },
  topic: 'Vector Databases',
  audience: 'software engineers',
  instructions: 'Use e-commerce examples throughout.',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  ai: { provider: 'deepseek', model: 'deepseek-chat' },
};

const SECTIONS: SectionDraft[] = [
  {
    number: 1,
    title: 'Foundations',
    markdown: `# Vector Databases: A 30-Minute Crash Course

## 1. Foundations

An embedding maps content to a vector. Similarity commonly uses $\\cos(\\theta)$.

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

![remote chart](https://example.test/chart.png)

### Key terms

- **Embedding:** a vector representation.
- **Similarity:** a distance or angle between vectors.
`,
  },
  {
    number: 2,
    title: 'Indexing',
    markdown: `Here is the section.

## 2. Indexing

HNSW builds a navigable graph. Inverted-file indexes trade recall for speed.

## Deep dive

Filters can reduce the candidate set before ranking.

<script>alert("bad")</script>
`,
  },
  {
    number: 3,
    title: 'Operations',
    markdown: `### No top heading

Content can start with a subsection. Monitor latency and recall together.
`,
  },
];

describe('assembleCourse', () => {
  it('matches the assembled course snapshot', () => {
    expect(
      assembleCourse({ outline: OUTLINE, sections: SECTIONS, identity: IDENTITY }),
    ).toMatchSnapshot();
  });

  it('produces a canonical course with one H1 and one H2 per section', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: SECTIONS,
      identity: IDENTITY,
    });
    const markdown = assembled.courseMarkdown;

    expect(markdown.startsWith('# Vector Databases: A 30-Minute Crash Course\n')).toBe(true);
    expect(markdown.match(/^# /gm)).toHaveLength(1);
    expect(markdown.match(/^## /gm)).toHaveLength(3);
    expect(markdown).toContain('## 1. Foundations');
    expect(markdown).toContain('## 2. Indexing');
    expect(markdown).toContain('## 3. Operations');
    expect(markdown).toContain('### Deep dive');
    expect(markdown).toContain('### No top heading');
    expect(markdown).not.toMatch(/^## Deep dive$/m);
    expect(markdown).not.toContain('## Course outline');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('strips Mermaid, images, duplicate top-level headings, and dangerous HTML', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: SECTIONS,
      identity: IDENTITY,
    });
    const markdown = assembled.courseMarkdown;

    expect(markdown).not.toContain('mermaid');
    expect(markdown).not.toContain('graph TD');
    expect(markdown).not.toContain('example.test/chart.png');
    expect(markdown).not.toContain('<script');
    expect(markdown).not.toContain('alert("bad")');
    expect(markdown).toContain('Here is the section.');
  });

  it('keeps LaTeX and Markdown formatting in section bodies', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: SECTIONS,
      identity: IDENTITY,
    });

    expect(assembled.courseMarkdown).toContain('$\\cos(\\theta)$');
    expect(assembled.courseMarkdown).toContain('**Embedding:** a vector representation.');
  });

  it('builds schema-valid metadata and matching statistics', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: SECTIONS,
      identity: IDENTITY,
    });
    const parsed = courseMetadataSchema.parse(assembled.metadata);

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      id: IDENTITY.id,
      subject: IDENTITY.subject,
      topic: 'Vector Databases',
      title: OUTLINE.title,
      audience: 'software engineers',
      instructions: 'Use e-commerce examples throughout.',
      status: 'complete',
      ai: { provider: 'deepseek', model: 'deepseek-chat' },
      promptVersion: '1',
    });
    expect(parsed.stats).toEqual({
      sections: 3,
      words: countWords(assembled.courseMarkdown),
      readingMinutes: Math.max(1, Math.ceil(countWords(assembled.courseMarkdown) / 200)),
    });
    expect(assembled.stats).toEqual(parsed.stats);
  });

  it('omits empty instructions from metadata', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: SECTIONS,
      identity: { ...IDENTITY, instructions: '   ' },
    });

    expect(assembled.metadata).not.toHaveProperty('instructions');
  });

  it('renders the standalone outline file', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: SECTIONS,
      identity: IDENTITY,
    });

    expect(assembled.outlineMarkdown).toContain('## Course outline');
    expect(assembled.outlineMarkdown).toContain('1. **Foundations**');
    expect(assembled.outlineMarkdown).not.toContain('An embedding maps content');
  });

  it('is deterministic for the same inputs', () => {
    const first = assembleCourse({ outline: OUTLINE, sections: SECTIONS, identity: IDENTITY });
    const second = assembleCourse({ outline: OUTLINE, sections: SECTIONS, identity: IDENTITY });

    expect(first).toEqual(second);
  });

  it('rejects missing, duplicate, or unexpected section drafts', () => {
    expect(() =>
      assembleCourse({
        outline: OUTLINE,
        sections: SECTIONS.slice(0, 2),
        identity: IDENTITY,
      }),
    ).toThrow(CourseAssemblyError);

    expect(() =>
      assembleCourse({
        outline: OUTLINE,
        sections: [...SECTIONS, SECTIONS[0] as SectionDraft],
        identity: IDENTITY,
      }),
    ).toThrow(/appears more than once|outline sections/);

    expect(() =>
      assembleCourse({
        outline: OUTLINE,
        sections: [...SECTIONS.slice(0, 2), { number: 9, title: 'Unexpected', markdown: 'Text' }],
        identity: IDENTITY,
      }),
    ).toThrow(/does not match/);
  });

  it('rejects a section with no content after heading cleanup', () => {
    expect(() =>
      assembleCourse({
        outline: OUTLINE,
        sections: [
          SECTIONS[0] as SectionDraft,
          { number: 2, title: 'Indexing', markdown: '## 2. Indexing\n\n' },
          SECTIONS[2] as SectionDraft,
        ],
        identity: IDENTITY,
      }),
    ).toThrow(/no content/);
  });

  it('does not rewrite heading-like text inside fenced code', () => {
    const assembled = assembleCourse({
      outline: OUTLINE,
      sections: [
        {
          number: 1,
          title: 'Foundations',
          markdown:
            '## 1. Foundations\n\nText.\n\n```md\n# Not a heading\n## Also not a heading\n```\n',
        },
        SECTIONS[1] as SectionDraft,
        SECTIONS[2] as SectionDraft,
      ],
      identity: IDENTITY,
    });

    expect(assembled.courseMarkdown).toContain('# Not a heading');
    expect(assembled.courseMarkdown).toContain('## Also not a heading');
    expect(assembled.courseMarkdown.match(/^## [0-9]/gm)).toHaveLength(3);
  });
});
