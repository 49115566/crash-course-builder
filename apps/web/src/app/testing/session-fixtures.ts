import type {
  ContinuationPrompt,
  ParsedOutline,
  SessionData,
  SessionSummary,
} from '@ccb/contracts';

const SUBJECT = { id: '123e4567-e89b-42d3-a456-42661417400a', name: 'Computer Science' };
const NOW = '2026-01-10T12:00:00.000Z';

export const OUTLINE: ParsedOutline = {
  title: 'Vector Databases: A 30-Minute Crash Course',
  cover: {
    promise: 'Choose and operate a vector search system.',
    audience: 'software engineers',
    summary: 'A practical tour of embeddings and indexing.',
  },
  sections: [
    { number: 1, title: 'Foundations', bullets: ['Embeddings', 'Similarity'] },
    { number: 2, title: 'Indexing', bullets: ['HNSW', 'Inverted files'] },
  ],
};

export function makePrompt(sectionNumber: number, title: string): ContinuationPrompt {
  return {
    version: '1',
    sectionNumber,
    sectionTitle: title,
    wordBudget: 640,
    system: 'Write one section from first principles.',
    user: `<section>${String(sectionNumber)} ${title}</section>`,
    estimatedTokens: 120,
  };
}

export function makeDraftSession(overrides: Partial<SessionData> = {}): SessionData {
  const startingPrompt = {
    version: '1' as const,
    system: 'You plan concise crash courses.',
    user: '<topic>Vector Databases</topic>\n<audience>software engineers</audience>',
    priorCourses: [{ topic: 'SQL', audience: 'analysts' }],
    estimatedTokens: 180,
  };

  return {
    schemaVersion: 1,
    id: '123e4567-e89b-42d3-a456-426614174020',
    status: 'draft',
    subject: SUBJECT,
    input: {
      topic: 'Vector Databases',
      audience: 'software engineers',
      instructions: 'Use practical examples.',
    },
    priorCourses: startingPrompt.priorCourses,
    startingPrompt,
    continuations: [],
    sections: [],
    courseId: '123e4567-e89b-42d3-a456-426614174021',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeOutlineSession(overrides: Partial<SessionData> = {}): SessionData {
  const prompts = OUTLINE.sections.map((section) => makePrompt(section.number, section.title));
  return makeDraftSession({
    status: 'outline_review',
    outlineRaw: '# Outline',
    outline: OUTLINE,
    continuations: prompts,
    sections: OUTLINE.sections.map((section) => ({
      number: section.number,
      title: section.title,
      bullets: section.bullets,
      wordBudget: 640,
      prompt: prompts[section.number - 1] ?? makePrompt(section.number, section.title),
      status: 'pending',
    })),
    ...overrides,
  });
}

export function makeWritingSession(overrides: Partial<SessionData> = {}): SessionData {
  const session = makeOutlineSession({
    status: 'expanding',
    stage: 'sections',
    activeSectionNumber: 2,
    sections: [
      {
        number: 1,
        title: 'Foundations',
        bullets: ['Embeddings'],
        wordBudget: 640,
        prompt: makePrompt(1, 'Foundations'),
        status: 'completed',
        markdown: '## 1. Foundations\n\nEmbeddings map meaning into vectors.',
      },
      {
        number: 2,
        title: 'Indexing',
        bullets: ['HNSW'],
        wordBudget: 640,
        prompt: makePrompt(2, 'Indexing'),
        status: 'running',
        markdown: undefined,
      },
    ],
    ...overrides,
  });
  return session;
}

export function summaryOf(
  session: SessionData,
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id: session.id,
    status: session.status,
    ...(session.stage === undefined ? {} : { stage: session.stage }),
    subject: session.subject,
    topic: session.input.topic,
    audience: session.input.audience,
    sectionCount: session.sections.length,
    completedSections: session.sections.filter((section) => section.status === 'completed').length,
    ...(session.activeSectionNumber === undefined
      ? {}
      : { activeSectionNumber: session.activeSectionNumber }),
    courseId: session.courseId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.savedPath === undefined ? {} : { savedPath: session.savedPath }),
    ...(session.lastError === undefined ? {} : { lastError: session.lastError }),
    ...overrides,
  };
}
