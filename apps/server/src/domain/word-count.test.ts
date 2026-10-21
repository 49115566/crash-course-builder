import { describe, expect, it } from 'vitest';

import { countWords, readingMinutes } from './word-count.js';

describe('word count', () => {
  it('counts prose words across Markdown formatting', () => {
    const markdown = [
      '# Foundations',
      '',
      'This is **bold** and *italic* text.',
      '',
      '| Concept | Meaning |',
      '| --- | --- |',
      '| Embedding | A vector |',
    ].join('\n');

    expect(countWords(markdown)).toBe(12);
  });

  it('counts links by label and excludes URLs', () => {
    expect(
      countWords('Read [the guide](https://example.test/a/b/c) and visit https://x.test.'),
    ).toBe(5);
  });

  it('ignores image markup and HTML tags', () => {
    expect(countWords('Before ![alt text](https://x.test/a.png) <span>after</span>')).toBe(2);
  });

  it('counts Unicode, numbers, and hyphenated words', () => {
    expect(countWords('Café naïve don’t 42 well-known 日本語')).toBe(6);
  });

  it('returns zero for empty or syntax-only content', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('# --- | ** `')).toBe(0);
  });

  it('derives a minimum reading time', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
    expect(readingMinutes(4500)).toBe(23);
  });
});
