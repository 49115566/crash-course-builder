import { z } from 'zod';

import { AUDIENCE_MAX_LENGTH, TOPIC_MAX_LENGTH } from './library.js';
import {
  MAX_SECTION_WORD_BUDGET,
  MIN_SECTION_WORD_BUDGET,
  OUTLINE_MAX_SECTIONS,
} from './outline.js';

export const PROMPT_VERSION = '1' as const;

export const PRIOR_COURSE_LIMIT = 50;

export const priorCourseSchema = z
  .object({
    topic: z.string().trim().min(1).max(TOPIC_MAX_LENGTH),
    audience: z.string().trim().min(1).max(AUDIENCE_MAX_LENGTH),
  })
  .strict();

export type PriorCourseRef = z.infer<typeof priorCourseSchema>;

export const aiPromptSchema = z
  .object({
    system: z.string().min(1),
    user: z.string().min(1),
  })
  .strict();

export type AiPrompt = z.infer<typeof aiPromptSchema>;

export const startingPromptSchema = z
  .object({
    version: z.literal(PROMPT_VERSION),
    system: z.string().min(1),
    user: z.string().min(1),
    priorCourses: z.array(priorCourseSchema).max(PRIOR_COURSE_LIMIT),
    estimatedTokens: z.number().int().nonnegative(),
  })
  .passthrough();

export type StartingPrompt = z.infer<typeof startingPromptSchema>;

export const continuationPromptSchema = z
  .object({
    version: z.literal(PROMPT_VERSION),
    sectionNumber: z.number().int().min(1).max(OUTLINE_MAX_SECTIONS),
    sectionTitle: z.string().min(1),
    wordBudget: z.number().int().min(MIN_SECTION_WORD_BUDGET).max(MAX_SECTION_WORD_BUDGET),
    system: z.string().min(1),
    user: z.string().min(1),
    estimatedTokens: z.number().int().nonnegative(),
  })
  .passthrough();

export type ContinuationPrompt = z.infer<typeof continuationPromptSchema>;

export const promptPreviewSchema = z
  .object({
    starting: startingPromptSchema,
    continuations: z.array(continuationPromptSchema),
  })
  .passthrough();

export type PromptPreview = z.infer<typeof promptPreviewSchema>;
