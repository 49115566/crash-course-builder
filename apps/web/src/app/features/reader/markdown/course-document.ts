import { Lexer, type Token, type Tokens } from 'marked';

export interface ReaderHeading {
  id: string;
  title: string;
  label: string;
  number: number | null;
  level: 2 | 3;
}

export interface CourseDocument {
  coverMarkdown: string;
  bodyMarkdown: string;
  headings: ReaderHeading[];
  sectionHeadings: ReaderHeading[];
}

const SECTION_NUMBER = /^(\d+)\s*[.)]\s*(.+)$/u;

function normalizeInlineText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug.length === 0 ? 'heading' : slug;
}

function isHeading(token: Token, depth?: number): token is Tokens.Heading {
  return token.type === 'heading' && (depth === undefined || token.depth === depth);
}

function rawOf(token: Token): string {
  return token.raw;
}

function leadingTitleRemoved(tokens: readonly Token[]): Token[] {
  const first = tokens.find((token) => token.type !== 'space');

  if (first === undefined || !isHeading(first, 1)) {
    return [...tokens];
  }

  return tokens.filter((token) => token !== first);
}

function headingTitle(token: Tokens.Heading): string {
  return normalizeInlineText(token.text);
}

function sectionIdentity(
  token: Tokens.Heading,
  ordinal: number,
  usedIds: Set<string>,
): { heading: ReaderHeading; sectionNumber: number } {
  const title = headingTitle(token);
  const numbered = SECTION_NUMBER.exec(title);
  const number = numbered === null ? null : Number.parseInt(numbered[1] ?? '', 10);
  const label = numbered === null ? title : normalizeInlineText(numbered[2] ?? '');
  const sectionNumber = number ?? ordinal;
  const baseId = `section-${String(sectionNumber)}`;
  let id = baseId;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${String(suffix)}`;
    suffix += 1;
  }
  usedIds.add(id);

  return {
    heading: {
      id,
      title,
      label: label.length === 0 ? title : label,
      number: sectionNumber,
      level: 2,
    },
    sectionNumber,
  };
}

function subsectionIdentity(
  token: Tokens.Heading,
  parentSection: number | null,
  usedIds: Set<string>,
): ReaderHeading {
  const title = headingTitle(token);
  const baseId = `${parentSection === null ? 'heading' : `section-${String(parentSection)}`}-${slugify(title)}`;
  let id = baseId;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${String(suffix)}`;
    suffix += 1;
  }
  usedIds.add(id);

  return { id, title, label: title, number: null, level: 3 };
}

export function parseCourseDocument(markdown: string): CourseDocument {
  let tokens: Token[];

  try {
    tokens = Lexer.lex(markdown, { gfm: true });
  } catch {
    return {
      coverMarkdown: markdown,
      bodyMarkdown: '',
      headings: [],
      sectionHeadings: [],
    };
  }

  const meaningful = tokens.filter((token) => token.type !== 'space');
  const firstSection = meaningful.findIndex((token) => isHeading(token, 2));

  if (firstSection < 0) {
    return {
      coverMarkdown: leadingTitleRemoved(meaningful).map(rawOf).join('\n').trim(),
      bodyMarkdown: '',
      headings: [],
      sectionHeadings: [],
    };
  }

  const coverMarkdown = leadingTitleRemoved(meaningful.slice(0, firstSection))
    .map(rawOf)
    .join('\n')
    .trim();
  const bodyTokens = meaningful.slice(firstSection);
  const bodyMarkdown = bodyTokens.map(rawOf).join('\n').trim();
  const headings: ReaderHeading[] = [];
  const sectionHeadings: ReaderHeading[] = [];
  const usedIds = new Set<string>();
  let currentSection: number | null = null;
  let sectionOrdinal = 0;

  for (const token of bodyTokens) {
    if (isHeading(token, 2)) {
      sectionOrdinal += 1;
      const identity = sectionIdentity(token, sectionOrdinal, usedIds);
      currentSection = identity.sectionNumber;
      headings.push(identity.heading);
      sectionHeadings.push(identity.heading);
      continue;
    }

    if (isHeading(token, 3)) {
      headings.push(subsectionIdentity(token, currentSection, usedIds));
    }
  }

  return { coverMarkdown, bodyMarkdown, headings, sectionHeadings };
}
