import { z } from 'zod';

export const LIBRARY_SCHEMA_VERSION = 1;

export const SUBJECT_NAME_MAX_LENGTH = 80;
export const TOPIC_MAX_LENGTH = 120;
export const AUDIENCE_MAX_LENGTH = 160;
export const INSTRUCTIONS_MAX_LENGTH = 4000;

export const LIBRARY_WARNING_CODES = [
  'SUBJECT_ADOPTED',
  'SUBJECT_METADATA_INVALID',
  'SUBJECT_NAME_REPAIRED',
  'SUBJECT_ID_DUPLICATE',
  'SUBJECT_UNREADABLE',
  'COURSE_METADATA_MISSING',
  'COURSE_METADATA_INVALID',
  'COURSE_SUBJECT_REPAIRED',
  'COURSE_ID_DUPLICATE',
  'COURSE_FILES_MISSING',
  'NESTED_DIRECTORY',
  'SYMLINK_SKIPPED',
  'LIBRARY_ORDER_INVALID',
  'REPAIR_FAILED',
  'DELETE_CLEANUP_FAILED',
] as const;

export type LibraryWarningCode = (typeof LIBRARY_WARNING_CODES)[number];

export const subjectIdSchema = z.uuid();
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const subjectMetadataSchema = z
  .object({
    schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
    id: subjectIdSchema,
    name: z.string().min(1),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .passthrough();

export type SubjectMetadata = z.infer<typeof subjectMetadataSchema>;

export const courseStatsSchema = z.object({
  sections: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  readingMinutes: z.number().int().nonnegative(),
});

export type CourseStats = z.infer<typeof courseStatsSchema>;

export const courseMetadataSchema = z
  .object({
    schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
    id: z.uuid(),
    subject: z.object({
      id: subjectIdSchema,
      name: z.string().min(1),
    }),
    topic: z.string().min(1).max(TOPIC_MAX_LENGTH),
    title: z.string().min(1),
    audience: z.string().min(1).max(AUDIENCE_MAX_LENGTH),
    instructions: z.string().max(INSTRUCTIONS_MAX_LENGTH).optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    status: z.literal('complete'),
    ai: z.object({
      provider: z.literal('deepseek'),
      model: z.string().min(1),
    }),
    promptVersion: z.string().min(1),
    stats: courseStatsSchema,
  })
  .passthrough();

export type CourseMetadata = z.infer<typeof courseMetadataSchema>;

export const libraryIndexFileSchema = z
  .object({
    schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
    subjectIds: z.array(subjectIdSchema),
  })
  .passthrough();

export type LibraryIndexFile = z.infer<typeof libraryIndexFileSchema>;

export const courseSummarySchema = z.object({
  id: z.uuid(),
  subjectId: subjectIdSchema,
  topic: z.string().min(1),
  title: z.string().min(1),
  audience: z.string().min(1),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  status: z.literal('complete'),
  stats: courseStatsSchema,
});

export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const subjectSummarySchema = z.object({
  id: subjectIdSchema,
  name: z.string().min(1),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  courses: z.array(courseSummarySchema),
});

export type SubjectSummary = z.infer<typeof subjectSummarySchema>;

export const libraryDataSchema = z.object({
  subjects: z.array(subjectSummarySchema),
  totalCourses: z.number().int().nonnegative(),
});

export type LibraryData = z.infer<typeof libraryDataSchema>;

export const createSubjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(SUBJECT_NAME_MAX_LENGTH),
  })
  .strict();

export type CreateSubjectRequest = z.infer<typeof createSubjectRequestSchema>;

export const renameSubjectRequestSchema = createSubjectRequestSchema;

export type RenameSubjectRequest = z.infer<typeof renameSubjectRequestSchema>;

export const reorderSubjectsRequestSchema = z
  .object({
    subjectIds: z.array(subjectIdSchema),
  })
  .strict();

export type ReorderSubjectsRequest = z.infer<typeof reorderSubjectsRequestSchema>;

export const moveCourseRequestSchema = z
  .object({
    subjectId: subjectIdSchema,
  })
  .strict();

export type MoveCourseRequest = z.infer<typeof moveCourseRequestSchema>;

export const deleteCourseRequestSchema = z
  .object({
    confirmed: z.literal(true),
  })
  .strict();

export type DeleteCourseRequest = z.infer<typeof deleteCourseRequestSchema>;

export const deleteSubjectRequestSchema = z
  .object({
    confirmed: z.literal(true),
    cascade: z.boolean().optional().default(false),
    confirmName: z.string().optional(),
  })
  .strict();

export type DeleteSubjectRequest = z.infer<typeof deleteSubjectRequestSchema>;

export const subjectMutationResponseSchema = z.object({
  subject: subjectSummarySchema,
});

export type SubjectMutationResponse = z.infer<typeof subjectMutationResponseSchema>;

export const reorderSubjectsResponseSchema = z.object({
  subjectIds: z.array(subjectIdSchema),
});

export type ReorderSubjectsResponse = z.infer<typeof reorderSubjectsResponseSchema>;

export const courseMutationResponseSchema = z.object({
  course: courseSummarySchema,
});

export type CourseMutationResponse = z.infer<typeof courseMutationResponseSchema>;

export const deleteCourseResponseSchema = z.object({
  deletedId: z.uuid(),
});

export type DeleteCourseResponse = z.infer<typeof deleteCourseResponseSchema>;

export const deleteSubjectResponseSchema = z.object({
  deletedId: z.uuid(),
  deletedCourses: z.number().int().nonnegative(),
});

export type DeleteSubjectResponse = z.infer<typeof deleteSubjectResponseSchema>;
