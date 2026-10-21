import { z } from 'zod';

import { courseStatsSchema, isoTimestampSchema } from './library.js';
import { parsedOutlineSchema } from './outline.js';
import { continuationPromptSchema } from './prompts.js';
import {
  sessionDataSchema,
  sessionErrorSchema,
  sessionIdSchema,
  sessionSummarySchema,
  sessionTokenUsageSchema,
} from './session.js';

const base = {
  sessionId: sessionIdSchema,
  at: isoTimestampSchema,
};

export const snapshotEventSchema = z.object({
  ...base,
  type: z.literal('snapshot'),
  session: sessionDataSchema,
});

export const statusEventSchema = z.object({
  ...base,
  type: z.literal('status'),
  session: sessionSummarySchema,
});

export const outlineDeltaEventSchema = z.object({
  ...base,
  type: z.literal('outline_delta'),
  text: z.string(),
});

export const outlineReadyEventSchema = z.object({
  ...base,
  type: z.literal('outline_ready'),
  outline: parsedOutlineSchema,
  continuations: z.array(continuationPromptSchema),
});

export const sectionStartedEventSchema = z.object({
  ...base,
  type: z.literal('section_started'),
  sectionNumber: z.number().int().min(1),
  title: z.string().min(1),
});

export const sectionDeltaEventSchema = z.object({
  ...base,
  type: z.literal('section_delta'),
  sectionNumber: z.number().int().min(1),
  text: z.string(),
});

export const sectionCompletedEventSchema = z.object({
  ...base,
  type: z.literal('section_completed'),
  sectionNumber: z.number().int().min(1),
  markdown: z.string(),
  usage: sessionTokenUsageSchema.optional(),
});

export const sectionFailedEventSchema = z.object({
  ...base,
  type: z.literal('section_failed'),
  sectionNumber: z.number().int().min(1),
  error: sessionErrorSchema,
});

export const completedEventSchema = z.object({
  ...base,
  type: z.literal('completed'),
  courseId: z.uuid(),
  savedPath: z.string().min(1),
  stats: courseStatsSchema,
});

export const sessionEventSchema = z.discriminatedUnion('type', [
  snapshotEventSchema,
  statusEventSchema,
  outlineDeltaEventSchema,
  outlineReadyEventSchema,
  sectionStartedEventSchema,
  sectionDeltaEventSchema,
  sectionCompletedEventSchema,
  sectionFailedEventSchema,
  completedEventSchema,
]);

export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type SnapshotEvent = z.infer<typeof snapshotEventSchema>;
export type StatusEvent = z.infer<typeof statusEventSchema>;
export type OutlineDeltaEvent = z.infer<typeof outlineDeltaEventSchema>;
export type OutlineReadyEvent = z.infer<typeof outlineReadyEventSchema>;
export type SectionStartedEvent = z.infer<typeof sectionStartedEventSchema>;
export type SectionDeltaEvent = z.infer<typeof sectionDeltaEventSchema>;
export type SectionCompletedEvent = z.infer<typeof sectionCompletedEventSchema>;
export type SectionFailedEvent = z.infer<typeof sectionFailedEventSchema>;
export type CompletedEvent = z.infer<typeof completedEventSchema>;
