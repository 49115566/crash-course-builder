const WORD_PATTERN = /[\p{L}][\p{L}\p{N}'’-]*|\p{N}+/gu;

export const WORDS_PER_MINUTE = 200;

export function countWords(markdown: string): number {
  if (markdown.trim().length === 0) return 0;
  return markdown.match(WORD_PATTERN)?.length ?? 0;
}

export function readingMinutes(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 1;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
