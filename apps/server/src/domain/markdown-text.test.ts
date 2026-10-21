import { Lexer } from 'marked';
import { describe, expect, it } from 'vitest';

import {
  collapseBlankLines,
  demoteHeadings,
  isTableOfContentsTitle,
  normalizeInlineText,
  normalizeTitleKey,
  parseHeadingLine,
  stripDangerousBlockHtml,
  stripImages,
  stripMermaidFences,
  stripOuterFence,
  stripTableOfContentsBlocks,
  tokenPlainText,
} from './markdown-text.js';

describe('markdown text helpers', () => {
  it('normalizes Unicode and inline whitespace', () => {
    expect(normalizeInlineText('  Cafe\u0301\t\n  au lait  ')).toBe('Café au lait');
    expect(normalizeTitleKey('  Section   ONE ')).toBe('section one');
  });

  it('parses ATX headings and ignores non-headings', () => {
    expect(parseHeadingLine('### 1. Foundations ###')).toEqual({
      depth: 3,
      text: '1. Foundations',
    });
    expect(parseHeadingLine('   ## Indexing')).toEqual({ depth: 2, text: 'Indexing' });
    expect(parseHeadingLine('    ## Indented code')).toBeNull();
    expect(parseHeadingLine('Plain text')).toBeNull();
  });

  it('recognizes table-of-contents titles', () => {
    expect(isTableOfContentsTitle('Table of Contents')).toBe(true);
    expect(isTableOfContentsTitle('Course Outline')).toBe(true);
    expect(isTableOfContentsTitle('Foundations')).toBe(false);
  });

  it('unwraps an answer wrapped in one code fence', () => {
    expect(stripOuterFence('```markdown\n# Title\n\n## 1. One\n```')).toBe('# Title\n\n## 1. One');
  });

  it('leaves ordinary Markdown and partial fences intact', () => {
    expect(stripOuterFence('# Title\n\n## 1. One')).toBe('# Title\n\n## 1. One');
    expect(stripOuterFence('Here you go:\n\n```markdown\n# Title\n```')).toContain('Here you go:');
  });

  it('extracts plain text from inline formatting and drops links and images', () => {
    const tokens = Lexer.lexInline(
      '**Bold** [link text](https://example.test) ![chart](https://example.test/chart.png) `code`',
    );

    expect(tokenPlainText(tokens)).toBe('Bold link text code');
  });

  it('removes Mermaid fences but keeps ordinary code fences', () => {
    const markdown = [
      '# Course',
      '',
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
      '```ts',
      'const a = 1;',
      '```',
    ].join('\n');

    const stripped = stripMermaidFences(markdown);

    expect(stripped).not.toContain('mermaid');
    expect(stripped).not.toContain('graph TD');
    expect(stripped).toContain('const a = 1;');
  });

  it('removes an unclosed Mermaid fence through the end', () => {
    const stripped = stripMermaidFences('# Course\n\n~~~mermaid\ngraph TD;\nA-->B;');

    expect(stripped.trim()).toBe('# Course');
  });

  it('removes Markdown and HTML images', () => {
    const stripped = stripImages(
      'Before ![chart](https://example.test/a.png) middle ![ref][logo] after <img src="x.png">',
    );

    expect(stripped).not.toContain('chart');
    expect(stripped).not.toContain('ref');
    expect(stripped).not.toContain('<img');
    expect(stripped).toContain('Before');
    expect(stripped).toContain('after');
  });

  it('preserves image and HTML examples inside fenced code', () => {
    const markdown = [
      'Before ![chart](https://example.test/a.png)',
      '',
      '```html',
      '<script>alert(1)</script>',
      '![example](https://example.test/example.png)',
      '```',
    ].join('\n');

    const stripped = stripImages(stripDangerousBlockHtml(markdown));

    expect(stripped).not.toContain('Before ![chart]');
    expect(stripped).toContain('<script>alert(1)</script>');
    expect(stripped).toContain('![example](https://example.test/example.png)');
  });

  it('removes dangerous block HTML without touching ordinary comparison text', () => {
    const stripped = stripDangerousBlockHtml(
      'Keep <script>alert(1)</script> and <style>body{}</style> but a < b and c > d.',
    );

    expect(stripped).not.toContain('<script');
    expect(stripped).not.toContain('<style');
    expect(stripped).toContain('a < b');
    expect(stripped).toContain('c > d');
  });

  it('removes generated TOC blocks until the next peer heading', () => {
    const markdown = [
      '# Course',
      '',
      '## Table of Contents',
      '',
      '1. [Foundations](#foundations)',
      '2. [Indexing](#indexing)',
      '',
      '## 1. Foundations',
      '',
      '- Embeddings',
    ].join('\n');

    const stripped = stripTableOfContentsBlocks(markdown);

    expect(stripped).not.toContain('Table of Contents');
    expect(stripped).not.toContain('[Foundations]');
    expect(stripped).toContain('## 1. Foundations');
  });

  it('demotes heading levels with a hard cap at H6', () => {
    expect(demoteHeadings('## Two\n\n### Three\n\n###### Six', 2, 3)).toBe(
      '### Two\n\n#### Three\n\n###### Six',
    );
  });

  it('collapses excess blank lines and trailing whitespace', () => {
    expect(collapseBlankLines('A   \n\n\n\nB\t\n')).toBe('A\n\nB');
  });
});
