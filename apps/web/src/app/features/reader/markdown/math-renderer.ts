import renderMathInElement from 'katex/contrib/auto-render';

export function renderCourseMath(root: HTMLElement): void {
  try {
    renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      trust: false,
      strict: 'ignore',
      throwOnError: false,
      maxExpand: 1000,
      maxSize: 50,
    });
  } catch {
    // Bad math should never prevent the rest of a course from being read.
  }
}
