import { describe, expect, it } from 'vitest';

import { COURSE_METADATA, LIBRARY_INDEX, SUBJECT_METADATA } from './library.test-data.js';
import {
  courseDetailSchema,
  courseMetadataSchema,
  createSubjectRequestSchema,
  deleteSubjectRequestSchema,
  libraryDataSchema,
  libraryIndexFileSchema,
  reorderSubjectsRequestSchema,
  subjectMetadataSchema,
} from './library.js';

describe('library disk schemas', () => {
  it('accepts valid subject metadata', () => {
    expect(subjectMetadataSchema.safeParse(SUBJECT_METADATA).success).toBe(true);
  });

  it('accepts valid course metadata and preserves unknown fields', () => {
    const parsed = courseMetadataSchema.parse({ ...COURSE_METADATA, futureField: true });

    expect(parsed.topic).toBe('Vector Databases');
    expect(parsed).toHaveProperty('futureField', true);
  });

  it('accepts a valid order file', () => {
    expect(libraryIndexFileSchema.safeParse(LIBRARY_INDEX).success).toBe(true);
  });

  it('rejects an unsupported schema version', () => {
    expect(subjectMetadataSchema.safeParse({ ...SUBJECT_METADATA, schemaVersion: 2 }).success).toBe(
      false,
    );
  });

  it('rejects malformed course stats', () => {
    expect(
      courseMetadataSchema.safeParse({
        ...COURSE_METADATA,
        stats: { sections: -1, words: 10, readingMinutes: 1 },
      }).success,
    ).toBe(false);
  });

  it('accepts nested library data', () => {
    expect(
      libraryDataSchema.safeParse({
        subjects: [
          {
            id: SUBJECT_METADATA.id,
            name: SUBJECT_METADATA.name,
            createdAt: SUBJECT_METADATA.createdAt,
            updatedAt: SUBJECT_METADATA.updatedAt,
            courses: [
              {
                id: COURSE_METADATA.id,
                subjectId: SUBJECT_METADATA.id,
                topic: COURSE_METADATA.topic,
                title: COURSE_METADATA.title,
                audience: COURSE_METADATA.audience,
                createdAt: COURSE_METADATA.createdAt,
                updatedAt: COURSE_METADATA.updatedAt,
                status: COURSE_METADATA.status,
                stats: COURSE_METADATA.stats,
              },
            ],
          },
        ],
        totalCourses: 1,
      }).success,
    ).toBe(true);
  });

  it('accepts a complete course detail payload and rejects missing files', () => {
    expect(
      courseDetailSchema.safeParse({
        meta: COURSE_METADATA,
        outlineMarkdown: '# Outline\n',
        courseMarkdown: '# Course\n',
      }).success,
    ).toBe(true);

    expect(
      courseDetailSchema.safeParse({
        meta: COURSE_METADATA,
        courseMarkdown: '# Course\n',
      }).success,
    ).toBe(false);
  });
});

describe('library request schemas', () => {
  it('trims and accepts subject names', () => {
    expect(createSubjectRequestSchema.parse({ name: '  Computer Science  ' }).name).toBe(
      'Computer Science',
    );
  });

  it('rejects empty and overlong subject names', () => {
    expect(createSubjectRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createSubjectRequestSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
  });

  it('rejects unknown request fields', () => {
    expect(createSubjectRequestSchema.safeParse({ name: 'Valid', unexpected: true }).success).toBe(
      false,
    );
  });

  it('requires confirmed deletion and defaults cascade to false', () => {
    const parsed = deleteSubjectRequestSchema.parse({ confirmed: true });

    expect(parsed.cascade).toBe(false);
    expect(deleteSubjectRequestSchema.safeParse({ confirmed: false }).success).toBe(false);
  });

  it('requires UUID subject ids in order requests', () => {
    expect(reorderSubjectsRequestSchema.safeParse({ subjectIds: ['not-a-uuid'] }).success).toBe(
      false,
    );
  });
});
