import type { ParsedOutline } from '@ccb/contracts';
import { describe, expect, it } from 'vitest';

import {
  renderCourseCover,
  renderOutlineMarkdown,
  sectionHeading,
  slugifyHeading,
} from './outline-renderer.js';

const OUTLINE: ParsedOutline = {
  title: 'Vector Databases: A 30-Minute Crash Course',
  cover: {
    promise: 'Choose, build, and operate a vector search system with confidence.',
    audience: 'software engineers',
    summary: 'A practical tour of embeddings, indexes, retrieval quality, and operations.',
  },
  sections: [
    { number: 1, title: 'Foundations', bullets: ['Embeddings', 'Similarity metrics'] },
    {
      number: 2,
      title: 'Retrieval quality',
      bullets: ['Recall', 'Hybrid search', 'Re-ranking'],
    },
  ],
};

describe('outline renderer', () => {
  it('matches the outline snapshot', () => {
    expect(renderOutlineMarkdown(OUTLINE)).toMatchSnapshot();
  });

  it('renders a standalone cover and numbered outline', () => {
    const markdown = renderOutlineMarkdown(OUTLINE);

    expect(markdown.startsWith('# Vector Databases: A 30-Minute Crash Course\n')).toBe(true);
    expect(markdown).toContain('> Choose, build, and operate');
    expect(markdown).toContain('**Audience:** software engineers');
    expect(markdown).toContain('## Course outline');
    expect(markdown).toContain('1. **Foundations**');
    expect(markdown).toContain('   - Similarity metrics');
    expect(markdown.match(/^## /gm)).toHaveLength(1);
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('omits optional cover fields that are missing', () => {
    const markdown = renderOutlineMarkdown({
      ...OUTLINE,
      cover: { audience: 'software engineers' },
    });

    expect(markdown).toContain('**Audience:** software engineers');
    expect(markdown).not.toContain('> Choose');
    expect(markdown).not.toContain('**Summary:**');
  });

  it('renders title-only sections without an empty bullet line', () => {
    const markdown = renderOutlineMarkdown({
      ...OUTLINE,
      sections: [{ number: 1, title: 'Only a title', bullets: [] }],
    });

    expect(markdown).toContain('1. **Only a title**');
    expect(markdown).not.toContain('1. **Only a title**\n   -');
  });

  it('renders the shared course cover', () => {
    expect(renderCourseCover(OUTLINE)).toBe(
      [
        '# Vector Databases: A 30-Minute Crash Course',
        '',
        '> Choose, build, and operate a vector search system with confidence.',
        '',
        '**Audience:** software engineers',
        '',
        '**Summary:** A practical tour of embeddings, indexes, retrieval quality, and operations.',
      ].join('\n'),
    );
  });

  it('formats canonical section headings', () => {
    expect(sectionHeading(3, '  Retrieval quality  ')).toBe('## 3. Retrieval quality');
  });

  it('creates stable Unicode-friendly heading slugs', () => {
    expect(slugifyHeading('1. Foundations')).toBe('1-foundations');
    expect(slugifyHeading('Café ☕ — Données vectorielles')).toBe('cafe-donnees-vectorielles');
    expect(slugifyHeading('日本語')).toBe('日本語');
    expect(slugifyHeading('###')).toBe('section');
  });
});
