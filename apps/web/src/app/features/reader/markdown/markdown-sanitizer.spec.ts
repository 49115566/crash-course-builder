import { describe, expect, it } from 'vitest';

import { sanitizeMarkdownHtml } from './markdown-sanitizer';

function clean(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = sanitizeMarkdownHtml(html);
  return element;
}

describe('sanitizeMarkdownHtml', () => {
  it('removes raw scripts, images, iframes, styles, and event handlers', () => {
    const element = clean(`
      <h2 onclick="alert(1)">Heading</h2>
      <script>alert('xss')</script>
      <img src="https://example.com/remote.png" onerror="alert(1)">
      <iframe src="https://example.com"></iframe>
      <p style="background:url(https://example.com/x)">Text</p>
      <svg onload="alert(1)"><circle /></svg>
    `);

    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('iframe')).toBeNull();
    expect(element.querySelector('svg')).toBeNull();
    expect(element.querySelector('h2')?.getAttribute('onclick')).toBeNull();
    expect(element.querySelector('p')?.getAttribute('style')).toBeNull();
    expect(element.textContent).toContain('Text');
  });

  it('rejects unsafe link protocols while keeping safe ones', () => {
    const element = clean(`
      <a href="javascript:alert(1)">bad</a>
      <a href="data:text/html,boom">data</a>
      <a href="https://example.com" target="_blank">good</a>
      <a href="mailto:hello@example.com">mail</a>
      <a href="#section-1">jump</a>
    `);
    const links = Array.from(element.querySelectorAll('a'));

    expect(links[0]?.getAttribute('href')).toBeNull();
    expect(links[1]?.getAttribute('href')).toBeNull();
    expect(links[2]?.getAttribute('href')).toBe('https://example.com');
    expect(links[2]?.getAttribute('target')).toBeNull();
    expect(links[3]?.getAttribute('href')).toBe('mailto:hello@example.com');
    expect(links[4]?.getAttribute('href')).toBe('#section-1');
  });

  it('keeps GFM tables, code, and lists', () => {
    const element = clean(`
      <table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table>
      <pre><code class="language-ts">const x = 1;</code></pre>
      <ul><li>One</li></ul>
    `);

    expect(element.querySelector('table th')?.textContent).toBe('Name');
    expect(element.querySelector('pre code')?.className).toBe('language-ts');
    expect(element.querySelector('li')?.textContent).toBe('One');
  });

  it('drops remote image syntax after the Marked renderer has already removed it', () => {
    const element = clean('<p>Before <img src="https://example.com/x.png" alt="x"> After</p>');

    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('Before');
    expect(element.textContent).toContain('After');
  });
});
