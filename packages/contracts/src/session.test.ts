import { describe, expect, it } from 'vitest';

import { bootstrapDataSchema } from './bootstrap.js';
import { sessionEventSchema } from './events.js';
import { createSessionRequestSchema, sessionDataSchema, sessionSummarySchema } from './session.js';

const startingPrompt = {
  version: '1' as const,
  system: 'Write an outline.',
  user: 'Topic: Vector Databases',
  priorCourses: [],
  estimatedTokens: 12,
};

const continuation = {
  version: '1' as const,
  sectionNumber: 1,
  sectionTitle: 'Foundations',
  wordBudget: 643,
  system: 'Write a section.',
  user: 'Write section one.',
  estimatedTokens: 24,
};

const baseSession = {
  schemaVersion: 1 as const,
  id: '123e4567-e89b-42d3-a456-426614174020',
  status: 'draft' as const,
  subject: { id: '123e4567-e89b-42d3-a456-426614174001', name: 'Computer Science' },
  input: { topic: 'Vector Databases', audience: 'software engineers' },
  priorCourses: [],
  startingPrompt,
  continuations: [],
  sections: [],
  courseId: '123e4567-e89b-42d3-a456-426614174021',
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('session contracts', () => {
  it('accepts a draft snapshot and fills default token usage', () => {
    const parsed = sessionDataSchema.parse({
      ...baseSession,
      usage: undefined,
    });

    expect(parsed.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    expect(parsed.status).toBe('draft');
  });

  it('accepts review sessions with outlines and sections', () => {
    const parsed = sessionDataSchema.parse({
      ...baseSession,
      status: 'outline_review',
      outlineRaw: '# Vector Databases\n\n## 1. Foundations\n- Embeddings',
      outline: {
        title: 'Vector Databases',
        cover: { promise: 'Understand vectors.' },
        sections: [
          { number: 1, title: 'Foundations', bullets: ['Embeddings'] },
          { number: 2, title: 'Indexing', bullets: ['HNSW'] },
        ],
      },
      continuations: [continuation],
      sections: [
        {
          number: 1,
          title: 'Foundations',
          bullets: ['Embeddings'],
          wordBudget: 643,
          prompt: continuation,
          status: 'pending',
        },
      ],
    });

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.continuations[0]?.sectionTitle).toBe('Foundations');
  });

  it('validates session input requests strictly', () => {
    expect(() =>
      createSessionRequestSchema.parse({
        subjectId: '123e4567-e89b-42d3-a456-426614174001',
        topic: 'Vector Databases',
        audience: 'software engineers',
        extra: true,
      }),
    ).toThrow();

    expect(
      createSessionRequestSchema.parse({
        subjectId: '123e4567-e89b-42d3-a456-426614174001',
        topic: ' Vector Databases ',
        audience: ' software engineers ',
      }),
    ).toMatchObject({ topic: 'Vector Databases', audience: 'software engineers' });
  });

  it('accepts session summaries and events', () => {
    const summary = sessionSummarySchema.parse({
      id: baseSession.id,
      status: 'expanding',
      stage: 'sections',
      subject: baseSession.subject,
      topic: baseSession.input.topic,
      audience: baseSession.input.audience,
      sectionCount: 7,
      completedSections: 2,
      activeSectionNumber: 3,
      courseId: baseSession.courseId,
      createdAt: baseSession.createdAt,
      updatedAt: baseSession.updatedAt,
    });

    const event = sessionEventSchema.parse({
      type: 'section_started',
      sessionId: summary.id,
      at: '2026-01-02T00:00:00.000Z',
      sectionNumber: 3,
      title: 'Indexing',
    });

    expect(event.type).toBe('section_started');
  });

  it('validates bootstrap data without secrets', () => {
    const parsed = bootstrapDataSchema.parse({
      version: '0.1.0',
      libraryRoot: '/home/user/CrashCourses',
      library: { status: 'ok' },
      provider: 'deepseek',
      model: 'deepseek-chat',
      key: { configured: true, source: 'keychain' },
    });

    expect(parsed.key.source).toBe('keychain');
  });
});
