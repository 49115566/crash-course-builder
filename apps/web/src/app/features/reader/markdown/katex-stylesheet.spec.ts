import { describe, expect, it } from 'vitest';

import { ensureKatexStylesheet } from './katex-stylesheet';

describe('ensureKatexStylesheet', () => {
  it('adds the reader-only KaTeX stylesheet exactly once', () => {
    const document = window.document;
    document.head.querySelectorAll('link[data-ccb-katex]').forEach((link) => link.remove());

    ensureKatexStylesheet(document);
    ensureKatexStylesheet(document);

    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[data-ccb-katex]')];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('rel')).toBe('stylesheet');
    expect(links[0]?.getAttribute('href')).toBe('/vendor/katex/katex.min.css');

    links[0]?.remove();
  });
});
