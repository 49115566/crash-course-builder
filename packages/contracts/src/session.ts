import { z } from 'zod';

import { errorCodeSchema } from './errors.js';
import {
  AUDIENCE_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  courseStatsSchema,
  isoTimestampSchema,
  subjectIdSchema,
} from './library.js';
import {
  MAX_SECTION_WORD_BUDGET,
  MIN_SECTION_WORD_BUDGET,
  OUTLINE_MAX_SECTIONS,
  parsedOutlineSchema,
} from './outline.js';
import { continuationPromptSchema, priorCourseSchema, startingPromptSchema } from './prompts.js';

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_DRAFT_TTL_DAYS = 7;

export const SESSION_STATUSES = [
  'draft',
  'generating_outline',
  'outline_review',
  'expanding',
  'completed',
  'failed',
  'paused',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const sessionStatusSchema = z.enum(SESSION_STATUSES);

export const SESSION_STAGES = ['outline', 'sections', 'finalization'] as const;

export type SessionStage = (typeof SESSION_STAGES)[number];

export const sessionStageSchema = z.enum(SESSION_STAGES);

export const SESSION_PAUSE_REASONS = ['user', 'stop', 'interrupted'] as const;

export type SessionPauseReason = (typeof SESSION_PAUSE_REASONS)[number];

export const sessionPauseReasonSchema = z.enum(SESSION_PAUSE_REASONS);

export const SESSION_SECTION_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

export type SessionSectionStatus = (typeof SESSION_SECTION_STATUSES)[number];

export const sessionSectionStatusSchema = z.enum(SESSION_SECTION_STATUSES);

export const sessionIdSchema = z.uuid();

export const sessionInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(TOPIC_MAX_LENGTH),
    audience: z.string().trim().min(1).max(AUDIENCE_MAX_LENGTH),
    instructions: z.string().max(INSTRUCTIONS_MAX_LENGTH).optional(),
  })
  .strict();

export type SessionInput = z.infer<typeof sessionInputSchema>;

export const sessionSubjectSchema = z.object({
  id: subjectIdSchema,
  name: z.string().min(1),
});

export type SessionSubject = z.infer<typeof sessionSubjectSchema>;

export const sessionTokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
});

export type SessionTokenUsage = z.infer<typeof sessionTokenUsageSchema>;

export const sessionErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).default({}),
  at: isoTimestampSchema,
});

export type SessionError = z.infer<typeof sessionErrorSchema>;

export const sessionSectionSchema = z
  .object({
    number: z.number().int().min(1).max(OUTLINE_MAX_SECTIONS),
    title: z.string().min(1),
    bullets: z.array(z.string().min(1)),
    wordBudget: z.number().int().min(MIN_SECTION_WORD_BUDGET).max(MAX_SECTION_WORD_BUDGET),
    prompt: continuationPromptSchema,
    status: sessionSectionStatusSchema,
    markdown: z.string().optional(),
    startedAt: isoTimestampSchema.optional(),
    completedAt: isoTimestampSchema.optional(),
    error: sessionErrorSchema.optional(),
    usage: sessionTokenUsageSchema.optional(),
  })
  .passthrough();

export type SessionSection = z.infer<typeof sessionSectionSchema>;

export const sessionDataSchema = z
  .object({
    schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
    id: sessionIdSchema,
    status: sessionStatusSchema,
    stage: sessionStageSchema.optional(),
    subject: sessionSubjectSchema,
    input: sessionInputSchema,
    priorCourses: z.array(priorCourseSchema),
    startingPrompt: startingPromptSchema,
    outlineRaw: z.string().optional(),
    outline: parsedOutlineSchema.optional(),
    continuations: z.array(continuationPromptSchema),
    sections: z.array(sessionSectionSchema),
    courseId: z.uuid(),
    usage: sessionTokenUsageSchema.default({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    startedAt: isoTimestampSchema.optional(),
    completedAt: isoTimestampSchema.optional(),
    pauseReason: sessionPauseReasonSchema.optional(),
    lastError: sessionErrorSchema.optional(),
    activeSectionNumber: z.number().int().min(1).max(OUTLINE_MAX_SECTIONS).optional(),
    savedPath: z.string().min(1).optional(),
  })
  .passthrough();

export type SessionData = z.infer<typeof sessionDataSchema>;

export const sessionSummarySchema = z.object({
  id: sessionIdSchema,
  status: sessionStatusSchema,
  stage: sessionStageSchema.optional(),
  subject: sessionSubjectSchema,
  topic: z.string().min(1),
  audience: z.string().min(1),
  title: z.string().min(1).optional(),
  sectionCount: z.number().int().nonnegative(),
  completedSections: z.number().int().nonnegative(),
  activeSectionNumber: z.number().int().min(1).max(OUTLINE_MAX_SECTIONS).optional(),
  courseId: z.uuid(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  pauseReason: sessionPauseReasonSchema.optional(),
  lastError: sessionErrorSchema.optional(),
  savedPath: z.string().min(1).optional(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const createSessionRequestSchema = z
  .object({
    subjectId: subjectIdSchema,
    topic: z.string().trim().min(1).max(TOPIC_MAX_LENGTH),
    audience: z.string().trim().min(1).max(AUDIENCE_MAX_LENGTH),
    instructions: z.string().max(INSTRUCTIONS_MAX_LENGTH).optional(),
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const updateSessionInputsRequestSchema = createSessionRequestSchema;

export type UpdateSessionInputsRequest = z.infer<typeof updateSessionInputsRequestSchema>;

export const sessionDataResponseSchema = z.object({
  session: sessionDataSchema,
});

export type SessionDataResponse = z.infer<typeof sessionDataResponseSchema>;

export const sessionSummaryResponseSchema = z.object({
  session: sessionSummarySchema,
});

export type SessionSummaryResponse = z.infer<typeof sessionSummaryResponseSchema>;

export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

export const deleteSessionResponseSchema = z.object({
  deletedId: sessionIdSchema,
});

export type DeleteSessionResponse = z.infer<typeof deleteSessionResponseSchema>;

export const sessionStatsSchema = courseStatsSchema;

export type SessionStats = z.infer<typeof sessionStatsSchema>;
