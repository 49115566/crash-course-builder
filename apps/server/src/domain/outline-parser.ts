import {
  MAX_OUTLINE_CHARS,
  MAX_SECTION_TITLE_LENGTH,
  OUTLINE_MAX_SECTIONS,
  OUTLINE_MIN_SECTIONS,
  parsedOutlineSchema,
  type OutlineCover,
  type OutlineSection,
  type ParsedOutline,
} from '@ccb/contracts';
import { Lexer, type Token, type Tokens } from 'marked';

import {
  collapseWhitespace,
  isTableOfContentsTitle,
  normalizeInlineText,
  normalizeTitleKey,
  normalizeUnicode,
  parseHeadingLine,
  stripOuterFence,
  tokenPlainText,
} from './markdown-text.js';
import { OutlineError, type OutlineIssue } from './outline-errors.js';

export interface ParseOutlineOptions {
  fallbackTitle: string;
  fallbackAudience: string;
}

interface WorkingSection {
  title: string;
  listBullets: string[];
  headingBullets: string[];
}

const COVER_LABEL = /^(promise|audience|summary|description|course summary)\s*[:\-–—]\s*(.+)$/i;
const ORDERED_LIST_LINE = /^\s*\d{1,3}[.)]\s+/u;

export function parseOutline(raw: string, options: ParseOutlineOptions): ParsedOutline {
  if (raw.trim().length === 0) {
    throw new OutlineError(
      'The outline response was empty. Regenerate the outline, or adjust the topic and try again.',
      [{ code: 'EMPTY', message: 'The outline response was empty.' }],
    );
  }

  if (raw.length > MAX_OUTLINE_CHARS) {
    throw new OutlineError(
      `The outline response is larger than the ${String(MAX_OUTLINE_CHARS)} character limit. Regenerate the outline.`,
      [
        {
          code: 'TOO_LARGE',
          message: `The outline exceeded ${String(MAX_OUTLINE_CHARS)} characters.`,
        },
      ],
    );
  }

  const normalized = stripOuterFence(raw);
  let tokens: Token[];

  try {
    tokens = Lexer.lex(normalized, { gfm: true });
  } catch {
    throw unparseable('The outline could not be read as Markdown.');
  }

  const issues: OutlineIssue[] = [];
  const title = extractTitle(tokens, options.fallbackTitle);
  const cover = extractCover(normalized, options.fallbackAudience);
  const sawH2 = tokens.some((token) => token.type === 'heading' && token.depth === 2);
  const sections = sawH2 ? collectH2Sections(tokens, issues) : collectNumberedList(tokens, issues);

  if (issues.length > 0) {
    const first = issues[0];
    throw new OutlineError(
      first?.message ?? 'The outline contains an invalid section. Regenerate the outline.',
      issues,
    );
  }

  if (sections.length < OUTLINE_MIN_SECTIONS) {
    throw new OutlineError(
      `The outline has ${String(sections.length)} sections. A course needs between ${String(OUTLINE_MIN_SECTIONS)} and ${String(OUTLINE_MAX_SECTIONS)} sections. Regenerate the outline or adjust the topic.`,
      [
        {
          code: 'TOO_FEW_SECTIONS',
          message: `Found ${String(sections.length)} sections; the minimum is ${String(OUTLINE_MIN_SECTIONS)}.`,
        },
      ],
    );
  }

  if (sections.length > OUTLINE_MAX_SECTIONS) {
    throw new OutlineError(
      `The outline has ${String(sections.length)} sections. A course can have at most ${String(OUTLINE_MAX_SECTIONS)} sections. Regenerate the outline or adjust the topic.`,
      [
        {
          code: 'TOO_MANY_SECTIONS',
          message: `Found ${String(sections.length)} sections; the maximum is ${String(OUTLINE_MAX_SECTIONS)}.`,
        },
      ],
    );
  }

  const duplicates = findDuplicateTitles(sections);

  if (duplicates.length > 0) {
    const firstDuplicate = duplicates[0] ?? 'a repeated title';
    throw new OutlineError(
      `The outline repeats the section title "${firstDuplicate}". Regenerate the outline with distinct section titles.`,
      duplicates.map((duplicate) => ({
        code: 'DUPLICATE_TITLE',
        message: `The section title "${duplicate}" appears more than once.`,
        title: duplicate,
      })),
    );
  }

  const numberedSections: OutlineSection[] = sections.map((section, index) => ({
    number: index + 1,
    title: section.title,
    bullets: finalizeBullets(section.listBullets, section.headingBullets),
  }));

  const outline: ParsedOutline = {
    title,
    cover,
    sections: numberedSections,
  };

  const validated = parsedOutlineSchema.safeParse(outline);

  if (!validated.success) {
    throw unparseable('The outline could not be normalized into a usable course outline.');
  }

  return validated.data;
}

function extractTitle(tokens: readonly Token[], fallbackTitle: string): string {
  for (const token of tokens) {
    if (token.type !== 'heading' || token.depth !== 1) {
      continue;
    }

    const rawTitle = tokenPlainText(token.tokens ?? []);
    const title = stripTitlePrefix(rawTitle);

    if (title.length > 0) {
      return truncateTitle(title);
    }
  }

  const fallback = normalizeInlineText(fallbackTitle);

  if (fallback.length === 0) {
    throw unparseable('The outline did not include a course title.');
  }

  return truncateTitle(fallback);
}

function stripTitlePrefix(value: string): string {
  return normalizeInlineText(value)
    .replace(/^(?:course\s+title|title)\s*[:\-–—]\s*/i, '')
    .trim();
}

function extractCover(markdown: string, fallbackAudience: string): OutlineCover {
  const lines = markdown.split('\n');
  let coverEnd = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const heading = parseHeadingLine(line);

    if (heading?.depth === 2 || (heading === null && ORDERED_LIST_LINE.test(line))) {
      coverEnd = index;
      break;
    }
  }

  let promise: string | undefined;
  let audience: string | undefined;
  let summary: string | undefined;
  const prose: string[] = [];

  for (let index = 0; index < coverEnd; index += 1) {
    const line = (lines[index] ?? '').trim();

    if (line.length === 0 || parseHeadingLine(line) !== null || /^[-*_]{3,}$/u.test(line)) {
      continue;
    }

    const withoutListMarker = line.replace(/^[-*+]\s+/u, '').replace(/^>\s?/u, '');
    const unformatted = withoutListMarker.replace(/\*\*|__/g, '');
    const label = COVER_LABEL.exec(unformatted);

    if (label !== null) {
      const key = label[1]?.toLocaleLowerCase('en-US');
      const value = inlinePlainText(label[2] ?? '');

      if (value.length === 0) {
        continue;
      }

      if (key === 'promise') {
        promise = value;
      } else if (key === 'audience') {
        audience = value;
      } else {
        summary = value;
      }
      continue;
    }

    if (!withoutListMarker.startsWith('[')) {
      const value = inlinePlainText(withoutListMarker);

      if (value.length > 0) {
        prose.push(value);
      }
    }
  }

  const resolvedAudience = audience ?? normalizeInlineText(fallbackAudience);
  const resolvedSummary = summary ?? (prose.length === 0 ? undefined : prose.join(' '));

  return {
    ...(promise === undefined ? {} : { promise }),
    ...(resolvedAudience.length === 0 ? {} : { audience: resolvedAudience }),
    ...(resolvedSummary === undefined ? {} : { summary: resolvedSummary }),
  };
}

function collectH2Sections(tokens: readonly Token[], issues: OutlineIssue[]): WorkingSection[] {
  const sections: WorkingSection[] = [];
  let current: WorkingSection | null = null;

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 2) {
      const title = normalizeSectionTitle(tokenPlainText(token.tokens ?? []));

      if (isTableOfContentsTitle(title)) {
        current = null;
        continue;
      }

      if (title.length === 0) {
        issues.push({
          code: 'EMPTY_TITLE',
          message:
            'The outline contains a section heading without a title. Regenerate the outline.',
          sectionNumber: sections.length + 1,
        });
        current = null;
        continue;
      }

      current = { title, listBullets: [], headingBullets: [] };
      sections.push(current);
      continue;
    }

    if (current === null) {
      continue;
    }

    if (token.type === 'heading' && token.depth === 3) {
      const heading = normalizeInlineText(tokenPlainText(token.tokens ?? []));

      if (heading.length > 0) {
        current.headingBullets.push(heading);
      }
      continue;
    }

    const list = asList(token);

    if (list !== null) {
      collectListBullets(list, current.listBullets);
    }
  }

  return sections;
}

function collectNumberedList(tokens: readonly Token[], issues: OutlineIssue[]): WorkingSection[] {
  const orderedLists: Tokens.List[] = [];

  for (const token of tokens) {
    const list = asList(token);

    if (list !== null && list.ordered) {
      orderedLists.push(list);
    }
  }

  if (orderedLists.length === 0) {
    throw new OutlineError(
      'No numbered sections were found in the outline. Regenerate the outline so it returns 6 to 9 numbered H2 sections.',
      [
        {
          code: 'UNPARSEABLE',
          message: 'No H2 sections or numbered outline were found.',
        },
      ],
    );
  }

  const list = orderedLists.reduce((best, candidate) =>
    candidate.items.length > best.items.length ? candidate : best,
  );
  const sections: WorkingSection[] = [];

  for (const [index, item] of list.items.entries()) {
    const titleSource = item.tokens
      .filter((token) => token.type !== 'list')
      .map((token) => tokenPlainText([token]))
      .join(' ');
    const title = normalizeSectionTitle(titleSource);

    if (title.length === 0) {
      issues.push({
        code: 'EMPTY_TITLE',
        message: 'The numbered outline contains an item without a title. Regenerate the outline.',
        sectionNumber: index + 1,
      });
      continue;
    }

    const bullets: string[] = [];

    for (const token of item.tokens) {
      const nested = asList(token);

      if (nested !== null) {
        collectListBullets(nested, bullets);
      }
    }

    sections.push({ title, listBullets: bullets, headingBullets: [] });
  }

  return sections;
}

function asList(token: Token): Tokens.List | null {
  if (token.type !== 'list') {
    return null;
  }

  const list = token as Tokens.List;
  return Array.isArray(list.items) ? list : null;
}

function collectListBullets(list: Tokens.List, target: string[]): void {
  for (const item of list.items) {
    const text = item.tokens
      .filter((token) => token.type !== 'list')
      .map((token) => tokenPlainText([token]))
      .join(' ');

    if (text.length > 0) {
      target.push(text);
    }

    for (const token of item.tokens) {
      const nested = asList(token);

      if (nested !== null) {
        collectListBullets(nested, target);
      }
    }
  }
}

function finalizeBullets(listBullets: string[], headingBullets: string[]): string[] {
  const source = listBullets.length > 0 ? listBullets : headingBullets;
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const rawBullet of source) {
    const bullet = normalizeInlineText(rawBullet);

    if (bullet.length === 0) {
      continue;
    }

    const key = normalizeTitleKey(bullet);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    bullets.push(bullet);
  }

  return bullets;
}

function normalizeSectionTitle(value: string): string {
  let title = normalizeInlineText(value);

  title = title.replace(/^(?:section|part)\s+\d+\s*[:\-–—]?\s*/i, '');
  title = title.replace(/^\d{1,2}\s*[.)\-–—:]\s*/u, '');
  title = title.replace(/^[-–—:]\s*/u, '');
  title = title.replace(/\s*[:\-–—]\s*$/u, '');
  title = collapseWhitespace(title);

  return truncateTitle(title);
}

function truncateTitle(value: string): string {
  const characters = Array.from(value);

  if (characters.length <= MAX_SECTION_TITLE_LENGTH) {
    return value;
  }

  const limit = Math.max(1, MAX_SECTION_TITLE_LENGTH - 1);
  const truncated = characters.slice(0, limit).join('');
  const lastSpace = truncated.lastIndexOf(' ');

  return `${(lastSpace > limit * 0.6 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

function findDuplicateTitles(sections: readonly WorkingSection[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const section of sections) {
    const key = normalizeTitleKey(section.title);
    const existing = seen.get(key);

    if (existing === undefined) {
      seen.set(key, section.title);
    } else {
      duplicates.add(existing);
    }
  }

  return [...duplicates];
}

function inlinePlainText(value: string): string {
  try {
    return tokenPlainText(Lexer.lexInline(normalizeUnicode(value), { gfm: true }));
  } catch {
    return normalizeInlineText(value);
  }
}

function unparseable(message: string): OutlineError {
  return new OutlineError(message, [{ code: 'UNPARSEABLE', message }]);
}
