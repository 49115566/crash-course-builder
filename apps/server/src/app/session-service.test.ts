import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AiChunk, AiProvider, OutlineInput, SectionInput } from '../ports/ai-provider.js';
import { FakeAiProvider } from '../adapters/fake-ai/fake-ai-provider.js';
import {
  IDS,
  makeCourseMetadata,
  makeTestApp,
  seedCourse,
  type TestAppContext,
} from '../test/library-fixtures.js';
import {
  SESSION_IDS,
  createReviewSessionFixture,
  createSessionFixture,
  waitFor,
} from '../test/session-fixtures.js';
import type { SessionService } from './session-service.js';

async function setup(provider: AiProvider = new FakeAiProvider()): Promise<{
  context: TestAppContext;
  service: SessionService;
  subjectId: string;
}> {
  const context = await makeTestApp({}, { provider });
  const subject = await context.service.createSubject('Computer Science');
  await seedCourse(
    context.libraryRoot + '/Computer Science',
    makeCourseMetadata(IDS.courseA, { id: subject.subject.id, name: 'Computer Science' }),
  );

  return { context, service: context.sessionService, subjectId: subject.subject.id };
}

async function writeSession(
  context: TestAppContext,
  session: ReturnType<typeof createSessionFixture>,
): Promise<void> {
  await writeFile(
    path.join(context.dataDir, 'sessions', `${session.id}.json`),
    `${JSON.stringify(session)}\n`,
    'utf8',
  );
}

async function waitStatus(
  service: SessionService,
  id: string,
  status: string,
): Promise<Awaited<ReturnType<SessionService['get']>>> {
  return waitFor(
    () => service.get(id),
    (session) => session.status === status,
  );
}

describe('SessionService', () => {
  it('builds prior-course context and rebuilds it when inputs change', async () => {
    const { context, service, subjectId } = await setup();

    try {
      const session = await service.create({
        subjectId,
        topic: 'Graph Databases',
        audience: 'developers',
        instructions: 'Use examples.',
      });

      expect(session.priorCourses).toEqual([
        { topic: 'Vector Databases', audience: 'software engineers' },
      ]);
      expect(session.startingPrompt.user).toContain('Assume the user has already taken');

      const updated = await service.updateInputs(session.id, {
        subjectId,
        topic: 'Knowledge Graphs',
        audience: 'data engineers',
      });

      expect(updated.status).toBe('draft');
      expect(updated.input.topic).toBe('Knowledge Graphs');
      expect(updated.startingPrompt.user).toContain('Knowledge Graphs');
      expect(updated.priorCourses).toHaveLength(1);
    } finally {
      await context.cleanup();
    }
  });

  it('rejects actions that do not match the current state', async () => {
    const { context, service, subjectId } = await setup();

    try {
      const session = await service.create({
        subjectId,
        topic: 'Graph Databases',
        audience: 'developers',
      });

      await expect(service.approve(session.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(service.pause(session.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(service.stop(session.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(service.resume(session.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(service.regenerateOutline(session.id)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      await expect(service.get(SESSION_IDS.course)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await context.cleanup();
    }
  });

  it('regenerates an outline after an outline failure', async () => {
    const provider = new FakeAiProvider({
      failure: { scope: 'outline', afterChunks: 2, code: 'AI_UPSTREAM' },
      failureOnce: true,
    });
    const { context, service, subjectId } = await setup(provider);

    try {
      const session = await service.create({
        subjectId,
        topic: 'Graph Databases',
        audience: 'developers',
      });
      await service.startOutline(session.id);
      const failed = await waitStatus(service, session.id, 'failed');
      expect(failed.stage).toBe('outline');
      expect(failed.outlineRaw).toBeUndefined();

      await service.regenerateOutline(session.id);
      const review = await waitStatus(service, session.id, 'outline_review');
      expect(review.continuations).toHaveLength(7);
    } finally {
      await context.cleanup();
    }
  });

  it('pauses after an outline call, resumes it, and reports interruptions on shutdown', async () => {
    const provider = new FakeAiProvider({ chunkSize: 8, delayMs: 8 });
    const { context, service, subjectId } = await setup(provider);

    try {
      const session = await service.create({
        subjectId,
        topic: 'Graph Databases',
        audience: 'developers',
      });
      await service.startOutline(session.id);
      await waitStatus(service, session.id, 'generating_outline');
      await service.pause(session.id);
      const paused = await waitStatus(service, session.id, 'paused');
      expect(paused.pauseReason).toBe('user');

      await service.resume(session.id);
      await waitStatus(service, session.id, 'outline_review');

      const second = await service.create({
        subjectId,
        topic: 'Streaming Systems',
        audience: 'developers',
      });
      await service.startOutline(second.id);
      await waitStatus(service, second.id, 'generating_outline');
      await service.shutdown();
      const interrupted = await waitStatus(service, second.id, 'paused');
      expect(interrupted.pauseReason).toBe('interrupted');
      await waitFor(
        () => Promise.resolve(context.coordinator.getActiveSessionId()),
        (active) => active === null,
      );
    } finally {
      await context.cleanup();
    }
  });

  it('rejects a second outline start after review and runs a defensive finalization', async () => {
    const { context, service, subjectId } = await setup();

    try {
      const session = await service.create({
        subjectId,
        topic: 'Graph Databases',
        audience: 'developers',
      });
      await service.startOutline(session.id);
      await waitStatus(service, session.id, 'outline_review');
      await expect(service.startOutline(session.id)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });

      const broken = createSessionFixture({
        id: '123e4567-e89b-42d3-a456-426614174099',
        subject: { id: subjectId, name: 'Computer Science' },
        status: 'paused',
        stage: 'finalization',
      });
      await writeSession(context, broken);
      await service.resume(broken.id);
      const failed = await waitStatus(service, broken.id, 'failed');
      expect(failed.stage).toBe('finalization');
      expect(failed.lastError?.code).toBe('INVALID_STATE');
    } finally {
      await context.cleanup();
    }
  });

  it('turns unexpected provider errors into a paused-with-error session', async () => {
    const failing: AiProvider = {
      // eslint-disable-next-line require-yield
      streamOutline: async function* (_input: OutlineInput, _signal: AbortSignal) {
        throw new Error('unexpected provider crash');
      },
      // eslint-disable-next-line require-yield
      streamSection: async function* (
        _input: SectionInput,
        _signal: AbortSignal,
      ): AsyncIterable<AiChunk> {
        throw new Error('unexpected provider crash');
      },
    };
    const { context, service, subjectId } = await setup(failing);

    try {
      const session = await service.create({
        subjectId,
        topic: 'Graph Databases',
        audience: 'developers',
      });
      await service.startOutline(session.id);
      const failed = await waitStatus(service, session.id, 'failed');
      expect(failed.lastError).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'unexpected provider crash',
      });
    } finally {
      await context.cleanup();
    }
  });

  it('reports incomplete assembled courses as finalization failures', async () => {
    const { context, service, subjectId } = await setup();
    const review = createReviewSessionFixture({
      id: '123e4567-e89b-42d3-a456-426614174098',
      subject: { id: subjectId, name: 'Computer Science' },
      status: 'paused',
      stage: 'finalization',
      sections: [
        {
          ...createReviewSessionFixture().sections[0]!,
          status: 'completed',
          markdown: '## 1. Foundations\n\nDone.',
        },
      ],
    });

    try {
      await writeSession(context, review);
      await service.resume(review.id);
      const failed = await waitStatus(service, review.id, 'failed');
      expect(failed.stage).toBe('finalization');
      expect(failed.lastError?.code).toBe('AI_UPSTREAM');
    } finally {
      await context.cleanup();
    }
  });

  it('reports missing subjects instead of creating orphan drafts', async () => {
    const { context, service } = await setup();

    try {
      await expect(
        service.create({
          subjectId: SESSION_IDS.course,
          topic: 'Missing',
          audience: 'anyone',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await context.cleanup();
    }
  });
});
