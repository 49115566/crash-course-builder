import { z } from 'zod';

export const OUTLINE_MIN_SECTIONS = 2;
export const OUTLINE_MAX_SECTIONS = 15;
export const OUTLINE_TARGET_MIN_SECTIONS = 6;
export const OUTLINE_TARGET_MAX_SECTIONS = 9;

export const TARGET_COURSE_WORDS = 4500;
export const MIN_SECTION_WORD_BUDGET = 350;
export const MAX_SECTION_WORD_BUDGET = 900;

export const MAX_OUTLINE_CHARS = 100_000;
export const MAX_SECTION_TITLE_LENGTH = 200;

export const outlineCoverSchema = z
  .object({
    promise: z.string().trim().min(1).optional(),
    audience: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
  })
  .passthrough();

export type OutlineCover = z.infer<typeof outlineCoverSchema>;

export const outlineSectionSchema = z
  .object({
    number: z.number().int().min(1).max(OUTLINE_MAX_SECTIONS),
    title: z.string().trim().min(1).max(MAX_SECTION_TITLE_LENGTH),
    bullets: z.array(z.string().trim().min(1)),
  })
  .passthrough();

export type OutlineSection = z.infer<typeof outlineSectionSchema>;

export const parsedOutlineSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_SECTION_TITLE_LENGTH),
    cover: outlineCoverSchema,
    sections: z.array(outlineSectionSchema).min(OUTLINE_MIN_SECTIONS).max(OUTLINE_MAX_SECTIONS),
  })
  .passthrough();

export type ParsedOutline = z.infer<typeof parsedOutlineSchema>;
