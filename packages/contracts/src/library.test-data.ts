import type { CourseMetadata, LibraryIndexFile, SubjectMetadata } from './library.js';

export const SUBJECT_METADATA: SubjectMetadata = {
  schemaVersion: 1,
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Computer Science',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const COURSE_METADATA: CourseMetadata = {
  schemaVersion: 1,
  id: '123e4567-e89b-42d3-a456-426614174001',
  subject: {
    id: SUBJECT_METADATA.id,
    name: SUBJECT_METADATA.name,
  },
  topic: 'Vector Databases',
  title: 'Vector Databases: A 30-Minute Crash Course',
  audience: 'software engineers',
  instructions: 'Use practical examples',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-03T00:00:00.000Z',
  status: 'complete',
  ai: { provider: 'deepseek', model: 'deepseek-chat' },
  promptVersion: '1',
  stats: { sections: 7, words: 4820, readingMinutes: 22 },
};

export const LIBRARY_INDEX: LibraryIndexFile = {
  schemaVersion: 1,
  subjectIds: [SUBJECT_METADATA.id],
};
