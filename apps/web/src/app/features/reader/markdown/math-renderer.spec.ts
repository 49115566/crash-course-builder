import { describe, expect, it } from 'vitest';

import { renderCourseMath } from './math-renderer';

describe('renderCourseMath', () => {
  it('renders inline and display math but leaves code alone', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <p>Inline $x^2 + y^2$ math.</p>
      <p>$$\\frac{1}{2}$$</p>
      <pre><code>$not math$</code></pre>
    `;

    renderCourseMath(root);

    expect(root.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.katex-display')).not.toBeNull();
    expect(root.querySelector('code .katex')).toBeNull();
    expect(root.textContent).toContain('$not math$');
  });

  it('renders malformed math without throwing or breaking nearby text', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Before $\\badcommand{ $ after.</p>';

    expect(() => renderCourseMath(root)).not.toThrow();
    expect(root.textContent).toContain('Before');
    expect(root.textContent).toContain('after.');
  });
});
