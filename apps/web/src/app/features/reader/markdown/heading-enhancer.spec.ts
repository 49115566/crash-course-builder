import { describe, expect, it } from 'vitest';

import { enhanceRenderedMarkdown } from './heading-enhancer';

describe('enhanceRenderedMarkdown', () => {
  it('assigns ids, anchors, safe rel attributes, and scrollable wrappers', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <h2>Foundations</h2>
      <h3>Distance</h3>
      <p><a href="https://example.com">external</a> <a href="javascript:alert(1)">bad</a></p>
      <table><tbody><tr><td>A</td></tr></tbody></table>
      <pre><code>const a = 1;</code></pre>
    `;

    enhanceRenderedMarkdown(root, ['section-1', 'section-1-distance']);

    expect(root.querySelector('h2')?.id).toBe('section-1');
    expect(root.querySelector('h3')?.id).toBe('section-1-distance');
    expect(root.querySelector('h2 a')?.getAttribute('href')).toBe('#section-1');
    expect(root.querySelector('h2 a')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('a[href="https://example.com"]')?.getAttribute('rel')).toBe(
      'noopener noreferrer nofollow',
    );
    expect(root.querySelector('a[href^="javascript"]')).toBeNull();
    expect(root.querySelector('.reader-table-scroll')?.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
  });

  it('is idempotent when ready fires more than once', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2>Foundations</h2><table><tr><td>A</td></tr></table>';

    enhanceRenderedMarkdown(root, ['section-1']);
    enhanceRenderedMarkdown(root, ['section-1']);

    expect(root.querySelectorAll('h2 a')).toHaveLength(1);
    expect(root.querySelectorAll('.reader-table-scroll')).toHaveLength(1);
  });
});
