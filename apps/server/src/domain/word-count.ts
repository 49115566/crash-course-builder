export const WORDS_PER_MINUTE = 200;

const WORD_PATTERN = /[\p{L}][\p{L}\p{N}'’-]*|\p{N}+/gu;
const INLINE_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const REFERENCE_IMAGE = /!\[[^\]]*\]\[[^\]]*\]/g;
const INLINE_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const REFERENCE_LINK = /\[([^\]]+)\]\[[^\]]*\]/g;
const AUTOLINK = /<((?:https?|mailto):[^>]+)>/gi;
const BARE_URL = /\b(?:https?|mailto):\S+/gi;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;

export function countWords(markdown: string): number {
  const text = markdown
    .normalize('NFKC')
    .replace(INLINE_IMAGE, '')
    .replace(REFERENCE_IMAGE, '')
    .replace(INLINE_LINK, '$1')
    .replace(REFERENCE_LINK, '$1')
    .replace(AUTOLINK, '')
    .replace(BARE_URL, '')
    .replace(HTML_TAG, ' ');

  return text.match(WORD_PATTERN)?.length ?? 0;
}

export function readingMinutes(words: number): number {
  if (!Number.isFinite(words) || words <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
