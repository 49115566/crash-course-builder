import { Lexer, type Token, type Tokens } from 'marked';

const TOC_TITLES = new Set(['table of contents', 'contents', 'course outline', 'outline']);

const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const MERMAID_OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?$/i;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const INLINE_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const REFERENCE_IMAGE = /!\[[^\]]*\]\[[^\]]*\]/g;
const HTML_IMAGE = /<img\b[^>]*>/gi;
const DANGEROUS_BLOCK = /<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_TAG = /<\/?(?:script|style|iframe|object|embed|form|img)\b[^>]*>/gi;

export interface HeadingLine {
  depth: number;
  text: string;
}

export function normalizeUnicode(value: string): string {
  return value.normalize('NFKC').replace(/\r\n?/g, '\n');
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

export function normalizeInlineText(value: string): string {
  return collapseWhitespace(normalizeUnicode(value));
}

export function normalizeTitleKey(value: string): string {
  return collapseWhitespace(normalizeUnicode(value)).toLocaleLowerCase('en-US').normalize('NFKC');
}

export function isTableOfContentsTitle(value: string): boolean {
  return TOC_TITLES.has(normalizeTitleKey(value));
}

export function parseHeadingLine(line: string): HeadingLine | null {
  const match = ATX_HEADING.exec(line);

  if (match === null) {
    return null;
  }

  const hashes = match[1];
  const text = match[2];

  if (hashes === undefined || text === undefined) {
    return null;
  }

  return { depth: hashes.length, text: collapseWhitespace(text) };
}

interface FenceState {
  character: string;
  length: number;
}

function openFence(line: string): FenceState | null {
  const match = FENCE_OPEN.exec(line);
  const fence = match?.[1];

  if (fence === undefined) {
    return null;
  }

  return { character: fence[0] ?? '`', length: fence.length };
}

function closesFence(line: string, fence: FenceState): boolean {
  const match = FENCE_CLOSE.exec(line);
  const closing = match?.[1] ?? '';
  const character = closing[0] ?? '`';

  return character === fence.character && closing.length >= fence.length;
}

export function rewriteHeadings(
  markdown: string,
  rewrite: (line: string, heading: HeadingLine) => string | null,
): string {
  const lines = normalizeUnicode(markdown).split('\n');
  const rewritten: string[] = [];
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (fence !== null) {
      rewritten.push(line);

      if (closesFence(line, fence)) {
        fence = null;
      }
      continue;
    }

    const opening = openFence(line);

    if (opening !== null) {
      fence = opening;
      rewritten.push(line);
      continue;
    }

    const heading = parseHeadingLine(line);
    const next = heading === null ? line : rewrite(line, heading);

    if (next !== null) {
      rewritten.push(next);
    }
  }

  return rewritten.join('\n');
}

export function stripOuterFence(markdown: string): string {
  let current = normalizeUnicode(markdown).trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let tokens: Token[];

    try {
      tokens = Lexer.lex(current, { gfm: true });
    } catch {
      return current;
    }

    const meaningful = tokens.filter((token) => token.type !== 'space');

    if (meaningful.length !== 1) {
      return current;
    }

    const [only] = meaningful;

    if (only?.type !== 'code') {
      return current;
    }

    const code = only as Tokens.Code;
    current = code.text.trim();
  }

  return current;
}

function inlineTextTokens(tokens: readonly Token[]): string {
  let text = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        text += token.tokens === undefined ? token.text : inlineTextTokens(token.tokens);
        break;
      case 'escape':
        text += token.text;
        break;
      case 'codespan':
        text += token.text;
        break;
      case 'strong':
      case 'em':
      case 'del':
      case 'link':
      case 'paragraph':
      case 'heading':
      case 'blockquote':
        text += inlineTextTokens(token.tokens ?? []);
        break;
      case 'br':
        text += ' ';
        break;
      case 'checkbox':
      case 'html':
      case 'image':
        break;
      default:
        break;
    }
  }

  return text;
}

export function tokenPlainText(tokens: readonly Token[]): string {
  return normalizeInlineText(inlineTextTokens(tokens));
}

export function stripMermaidFences(markdown: string): string {
  const lines = normalizeUnicode(markdown).split('\n');
  const kept: string[] = [];
  let openFence: { character: string; length: number } | null = null;

  for (const line of lines) {
    if (openFence === null) {
      const opening = MERMAID_OPEN.exec(line);

      if (opening !== null) {
        const fence = opening[1] ?? '```';
        openFence = { character: fence[0] ?? '`', length: fence.length };
        continue;
      }

      kept.push(line);
      continue;
    }

    const closing = FENCE_CLOSE.exec(line);

    if (closing !== null) {
      const fence = closing[1] ?? '';
      const character = fence[0] ?? '`';

      if (character === openFence.character && fence.length >= openFence.length) {
        openFence = null;
      }
    }
  }

  return kept.join('\n');
}

function mapOutsideFences(markdown: string, transform: (line: string) => string): string {
  const lines = normalizeUnicode(markdown).split('\n');
  const kept: string[] = [];
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (fence !== null) {
      kept.push(line);

      if (closesFence(line, fence)) {
        fence = null;
      }
      continue;
    }

    const opening = openFence(line);

    if (opening !== null) {
      fence = opening;
      kept.push(line);
      continue;
    }

    kept.push(transform(line));
  }

  return kept.join('\n');
}

export function stripImages(markdown: string): string {
  return mapOutsideFences(markdown, (line) =>
    line.replace(INLINE_IMAGE, '').replace(REFERENCE_IMAGE, '').replace(HTML_IMAGE, ''),
  );
}

export function stripDangerousBlockHtml(markdown: string): string {
  return mapOutsideFences(markdown, (line) =>
    line.replace(DANGEROUS_BLOCK, '').replace(DANGEROUS_TAG, ''),
  );
}

export function stripTableOfContentsBlocks(markdown: string): string {
  const lines = normalizeUnicode(markdown).split('\n');
  const kept: string[] = [];
  let skipDepth: number | null = null;
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (fence !== null) {
      if (skipDepth === null) {
        kept.push(line);
      }

      if (closesFence(line, fence)) {
        fence = null;
      }
      continue;
    }

    const opening = openFence(line);

    if (opening !== null) {
      fence = opening;

      if (skipDepth === null) {
        kept.push(line);
      }
      continue;
    }

    const heading = parseHeadingLine(line);

    if (heading !== null) {
      if (skipDepth !== null && heading.depth <= skipDepth) {
        skipDepth = null;
      }

      if (skipDepth === null && isTableOfContentsTitle(heading.text)) {
        skipDepth = heading.depth;
        continue;
      }
    }

    if (skipDepth === null) {
      kept.push(line);
    }
  }

  return kept.join('\n');
}

export function demoteHeadings(markdown: string, fromDepth: number, toDepth: number): string {
  const lines = normalizeUnicode(markdown).split('\n');
  const demoted = lines.map((line) => {
    const heading = parseHeadingLine(line);

    if (heading === null || heading.depth < fromDepth) {
      return line;
    }

    const depth = Math.min(6, heading.depth + (toDepth - fromDepth));
    return `${'#'.repeat(depth)} ${heading.text}`;
  });

  return demoted.join('\n');
}

export function collapseBlankLines(markdown: string): string {
  const lines = normalizeUnicode(markdown).split('\n');
  const kept: string[] = [];
  let fence: FenceState | null = null;
  let pendingBlank = false;

  for (const line of lines) {
    if (fence !== null) {
      kept.push(line);

      if (closesFence(line, fence)) {
        fence = null;
      }
      continue;
    }

    const opening = openFence(line);

    if (opening !== null) {
      if (pendingBlank && kept.length > 0) {
        kept.push('');
      }

      pendingBlank = false;
      kept.push(line);
      fence = opening;
      continue;
    }

    if (line.trim().length === 0) {
      pendingBlank = true;
      continue;
    }

    if (pendingBlank && kept.length > 0) {
      kept.push('');
    }

    pendingBlank = false;
    kept.push(line.replace(/[ \t]+$/u, ''));
  }

  return kept.join('\n').trim();
}
