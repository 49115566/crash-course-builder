import type { ParsedOutline } from '@ccb/contracts';

import { collapseBlankLines, normalizeInlineText } from './markdown-text.js';

export function sectionHeading(number: number, title: string): string {
  return `## ${String(number)}. ${normalizeInlineText(title)}`;
}

export function renderCourseCover(outline: ParsedOutline): string {
  return [
    `# ${normalizeInlineText(outline.title)}`,
    ...(outline.cover.promise === undefined
      ? []
      : ['', `> ${normalizeInlineText(outline.cover.promise)}`]),
    ...(outline.cover.audience === undefined
      ? []
      : ['', `**Audience:** ${normalizeInlineText(outline.cover.audience)}`]),
    ...(outline.cover.summary === undefined
      ? []
      : ['', `**Summary:** ${normalizeInlineText(outline.cover.summary)}`]),
  ].join('\n');
}

export function renderOutlineMarkdown(outline: ParsedOutline): string {
  const outlineItems = outline.sections.map((section) => {
    const lines = [`${String(section.number)}. **${normalizeInlineText(section.title)}**`];

    for (const bullet of section.bullets) {
      lines.push(`   - ${normalizeInlineText(bullet)}`);
    }

    return lines.join('\n');
  });

  return collapseBlankLines(
    [renderCourseCover(outline), '', '## Course outline', '', outlineItems.join('\n\n')].join('\n'),
  ).concat('\n');
}

export function slugifyHeading(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug.length === 0 ? 'section' : slug;
}
