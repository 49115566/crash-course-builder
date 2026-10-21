const KATEX_STYLESHEET_SELECTOR = 'link[data-ccb-katex]';
const KATEX_STYLESHEET_HREF = '/vendor/katex/katex.min.css';

export function ensureKatexStylesheet(document: Document): void {
  if (document.querySelector(KATEX_STYLESHEET_SELECTOR) !== null) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = KATEX_STYLESHEET_HREF;
  link.setAttribute('data-ccb-katex', '');
  document.head.appendChild(link);
}
