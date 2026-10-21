const SAFE_LINK = /^(?:https?:\/\/|mailto:|#|\/(?!\/)|\.{1,2}\/)/iu;

function decorateSectionNumber(heading: HTMLElement): void {
  const first = heading.firstChild;

  if (first === null || first.nodeType !== Node.TEXT_NODE) {
    return;
  }

  const match = /^(\d+)\.\s+/u.exec(first.textContent ?? '');

  if (match === null) {
    return;
  }

  const number = match[1] ?? '';
  first.textContent = (first.textContent ?? '').slice(match[0].length);
  const badge = document.createElement('span');
  badge.className = 'reader-heading__number';
  badge.textContent = number;
  heading.prepend(badge);
}

function fallbackId(heading: HTMLElement, used: Set<string>): string {
  const base =
    heading.textContent
      ?.normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('en-US')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'section';
  let id = base;
  let suffix = 2;

  while (used.has(id)) {
    id = `${base}-${String(suffix)}`;
    suffix += 1;
  }

  return id;
}

export function enhanceRenderedMarkdown(root: HTMLElement, headingIds: readonly string[]): void {
  const used = new Set<string>();
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'));

  headings.forEach((heading, index) => {
    if (heading.dataset['ccbEnhanced'] === 'true') {
      return;
    }

    const id = headingIds[index] ?? fallbackId(heading, used);
    heading.id = id;
    used.add(id);
    heading.dataset['ccbEnhanced'] = 'true';
    decorateSectionNumber(heading);

    const anchor = document.createElement('a');
    anchor.className = 'reader-heading__anchor';
    anchor.href = `#${id}`;
    anchor.setAttribute('aria-hidden', 'true');
    anchor.tabIndex = -1;
    anchor.textContent = '#';
    heading.append(anchor);
  });

  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (link.classList.contains('reader-heading__anchor')) {
      continue;
    }

    if (!SAFE_LINK.test(link.getAttribute('href') ?? '')) {
      link.removeAttribute('href');
      continue;
    }

    if (/^https?:\/\//iu.test(link.getAttribute('href') ?? '')) {
      link.rel = 'noopener noreferrer nofollow';
      link.referrerPolicy = 'no-referrer';
    }
  }

  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>('table'))) {
    if (table.parentElement?.classList.contains('reader-table-scroll')) {
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'reader-table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Course table. Scroll horizontally if needed.');
    table.replaceWith(wrapper);
    wrapper.append(table);
  }

  for (const pre of Array.from(root.querySelectorAll<HTMLPreElement>('pre'))) {
    pre.tabIndex = 0;
  }
}
