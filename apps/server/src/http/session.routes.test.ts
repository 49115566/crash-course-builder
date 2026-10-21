import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  bootstrapDataSchema,
  courseMetadataSchema,
  deleteSessionResponseSchema,
  sessionDataResponseSchema,
  sessionSummaryResponseSchema,
  type ApiError,
  type SessionData,
} from '@ccb/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeAiProvider } from '../adapters/fake-ai/fake-ai-provider.js';
import { LibraryError } from '../domain/library-errors.js';
import { createSessionFixture, waitFor } from '../test/session-fixtures.js';
import { MemorySecretStore, makeTestApp, type TestAppContext } from '../test/library-fixtures.js';

const contexts: TestAppContext[] = [];

async function appContext(
  options: Parameters<typeof makeTestApp>[1] = {},
): Promise<TestAppContext> {
  const context = await makeTestApp({}, options);
  contexts.push(context);
  return context;
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
});

function dataOf<T>(body: unknown): T {
  return (body as { data: T }).data;
}

function errorOf(body: unknown): ApiError['error'] {
  return (body as ApiError).error;
}

async function createSubject(context: TestAppContext, name = 'Computer Science'): Promise<string> {
  const response = await request(context.app).post('/api/subjects').send({ name }).expect(201);
  return dataOf<{ subject: { id: string } }>(response.body).subject.id;
}

async function createDraft(
  context: TestAppContext,
  subjectId: string,
  overrides: Partial<{ topic: string; audience: string; instructions: string }> = {},
): Promise<SessionData> {
  const response = await request(context.app)
    .post('/api/sessions')
    .send({
      subjectId,
      topic: overrides.topic ?? 'Vector Databases',
      audience: overrides.audience ?? 'software engineers',
      instructions: overrides.instructions ?? 'Use practical examples.',
    })
    .expect(201);

  return sessionDataResponseSchema.parse(dataOf(response.body)).session;
}

async function getSession(context: TestAppContext, id: string): Promise<SessionData> {
  const response = await request(context.app).get(`/api/sessions/${id}`).expect(200);
  return sessionDataResponseSchema.parse(dataOf(response.body)).session;
}

async function waitForStatus(
  context: TestAppContext,
  id: string,
  status: SessionData['status'],
): Promise<SessionData> {
  return waitFor(
    () => getSession(context, id),
    (session) => session.status === status,
  );
}

async function outlineAndApprove(context: TestAppContext, id: string): Promise<void> {
  await request(context.app).post(`/api/sessions/${id}/outline`).expect(202);
  await waitForStatus(context, id, 'outline_review');
  await request(context.app).post(`/api/sessions/${id}/approve`).expect(202);
}

describe('session API', () => {
  it('creates an exact prompt preview and completes the full lifecycle', async () => {
    const context = await appContext();
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);

    expect(session.status).toBe('draft');
    expect(session.startingPrompt.user).toContain('<topic>Vector Databases</topic>');
    expect(session.startingPrompt.user).toContain('Use practical examples.');
    expect(session.sections).toEqual([]);

    const bootstrap = await request(context.app).get('/api/bootstrap').expect(200);
    const bootstrapData = bootstrapDataSchema.parse(dataOf(bootstrap.body));
    expect(bootstrapData.key).toEqual({ configured: true, source: 'environment' });
    expect(JSON.stringify(bootstrap.body)).not.toContain('test-key');

    await outlineAndApprove(context, session.id);
    const completed = await waitForStatus(context, session.id, 'completed');

    expect(completed.sections).toHaveLength(7);
    expect(completed.sections.every((section) => section.status === 'completed')).toBe(true);
    expect(completed.sections.every((section) => (section.markdown ?? '').length > 0)).toBe(true);
    expect(completed.savedPath).toBe('Computer Science/Vector Databases');

    const coursePath = path.join(context.libraryRoot, completed.savedPath ?? '');
    const metadata = courseMetadataSchema.parse(
      JSON.parse(await readFile(path.join(coursePath, 'meta.json'), 'utf8')),
    );
    expect(metadata.stats.sections).toBe(7);
    expect(metadata.title).toContain('Vector Databases');
    expect(await readFile(path.join(coursePath, 'course.md'), 'utf8')).toContain(
      '## 1. Foundations',
    );
    expect(await readFile(path.join(coursePath, 'outline.md'), 'utf8')).toContain(
      '## Course outline',
    );
  });

  it('pauses with an error, resumes only the missing work, and never auto-retries', async () => {
    const provider = new FakeAiProvider({
      chunkSize: 20,
      failure: {
        scope: 'section',
        sectionNumber: 2,
        afterChunks: 1,
        code: 'AI_TIMEOUT',
        message: 'Timed out while writing.',
      },
      failureOnce: true,
    });
    const context = await appContext({ provider });
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    await outlineAndApprove(context, session.id);

    const failed = await waitForStatus(context, session.id, 'failed');
    expect(failed.stage).toBe('sections');
    expect(failed.lastError?.code).toBe('AI_TIMEOUT');
    expect(failed.sections.filter((section) => section.status === 'completed')).toHaveLength(1);
    expect(failed.sections[1]?.status).toBe('failed');

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect((await getSession(context, session.id)).status).toBe('failed');

    await request(context.app).post(`/api/sessions/${session.id}/resume`).expect(202);
    const completed = await waitForStatus(context, session.id, 'completed');
    expect(completed.sections.every((section) => section.status === 'completed')).toBe(true);
  });

  it('retries finalization without making another AI call', async () => {
    const provider = new FakeAiProvider();
    const sectionSpy = vi.spyOn(provider, 'streamSection');
    const context = await appContext({ provider });
    const finalizeSpy = vi
      .spyOn(context.service, 'finalizeCourse')
      .mockRejectedValueOnce(new LibraryError('LIBRARY_UNAVAILABLE', 'Disk temporarily busy.'));
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    await outlineAndApprove(context, session.id);

    const failed = await waitForStatus(context, session.id, 'failed');
    expect(failed.stage).toBe('finalization');
    expect(failed.sections.every((section) => section.status === 'completed')).toBe(true);
    expect(sectionSpy).toHaveBeenCalledTimes(7);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);

    await request(context.app).post(`/api/sessions/${session.id}/resume`).expect(202);
    await waitForStatus(context, session.id, 'completed');
    expect(sectionSpy).toHaveBeenCalledTimes(7);
    expect(finalizeSpy).toHaveBeenCalledTimes(2);
  });

  it('resets inputs from outline review and blocks regeneration after expansion', async () => {
    const context = await appContext();
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    await request(context.app).post(`/api/sessions/${session.id}/outline`).expect(202);
    const review = await waitForStatus(context, session.id, 'outline_review');
    expect(review.continuations).toHaveLength(7);

    const resetResponse = await request(context.app)
      .patch(`/api/sessions/${session.id}/inputs`)
      .send({ subjectId, topic: 'Graph Databases', audience: 'developers' })
      .expect(200);
    const reset = sessionDataResponseSchema.parse(dataOf(resetResponse.body)).session;
    expect(reset.status).toBe('draft');
    expect(reset.outline).toBeUndefined();
    expect(reset.continuations).toEqual([]);
    expect(reset.sections).toEqual([]);
    expect(reset.startingPrompt.user).toContain('Graph Databases');

    await outlineAndApprove(context, session.id);
    await waitForStatus(context, session.id, 'completed');

    const regenerate = await request(context.app)
      .post(`/api/sessions/${session.id}/regenerate-outline`)
      .expect(409);
    expect(errorOf(regenerate.body)).toMatchObject({ code: 'EXPANSION_STARTED' });

    const edit = await request(context.app)
      .patch(`/api/sessions/${session.id}/inputs`)
      .send({ subjectId, topic: 'Changed', audience: 'developers' })
      .expect(409);
    expect(errorOf(edit.body)).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('returns GENERATION_BUSY while another workflow is active', async () => {
    const provider = new FakeAiProvider({ chunkSize: 8, delayMs: 8 });
    const context = await appContext({ provider });
    const subjectId = await createSubject(context);
    const first = await createDraft(context, subjectId);
    const second = await createDraft(context, subjectId, { topic: 'Graph Databases' });
    await request(context.app).post(`/api/sessions/${first.id}/outline`).expect(202);
    await waitForStatus(context, first.id, 'generating_outline');

    const busy = await request(context.app).post(`/api/sessions/${second.id}/outline`).expect(409);
    expect(errorOf(busy.body).code).toBe('GENERATION_BUSY');
    expect(errorOf(busy.body).details).toMatchObject({ activeSessionId: first.id });

    await request(context.app).post(`/api/sessions/${first.id}/pause`).expect(202);
    const paused = await waitForStatus(context, first.id, 'paused');
    expect(paused.pauseReason).toBe('user');
    expect(paused.stage).toBe('outline');

    await request(context.app).post(`/api/sessions/${second.id}/outline`).expect(202);
    await waitForStatus(context, second.id, 'outline_review');
  });

  it('stops an active expansion immediately, preserves completed sections, and resumes', async () => {
    const provider = new FakeAiProvider({ chunkSize: 16, delayMs: 12 });
    const context = await appContext({ provider });
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    await outlineAndApprove(context, session.id);

    const inProgress = await waitFor(
      () => getSession(context, session.id),
      (current) =>
        current.status === 'expanding' &&
        current.sections.some((section) => section.status === 'completed') &&
        current.sections.some((section) => section.status === 'running'),
    );
    const completedBeforeStop = inProgress.sections.filter(
      (section) => section.status === 'completed',
    ).length;

    await request(context.app).post(`/api/sessions/${session.id}/stop`).expect(202);
    const paused = await waitForStatus(context, session.id, 'paused');
    expect(paused.pauseReason).toBe('stop');
    expect(paused.sections.filter((section) => section.status === 'completed').length).toBe(
      completedBeforeStop,
    );
    expect(paused.sections.some((section) => section.status === 'running')).toBe(false);

    await request(context.app).post(`/api/sessions/${session.id}/resume`).expect(202);
    const completed = await waitForStatus(context, session.id, 'completed');
    expect(completed.sections.every((section) => section.status === 'completed')).toBe(true);
  }, 15_000);

  it('deletes an active session without allowing the runner to recreate it', async () => {
    const context = await appContext({
      provider: new FakeAiProvider({ chunkSize: 8, delayMs: 8 }),
    });
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    await request(context.app).post(`/api/sessions/${session.id}/outline`).expect(202);
    await waitForStatus(context, session.id, 'generating_outline');

    await request(context.app).delete(`/api/sessions/${session.id}`).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await request(context.app).get(`/api/sessions/${session.id}`).expect(404);
    expect(context.coordinator.getActiveSessionId()).not.toBe(session.id);
  });

  it('marks an unusable outline as paused with an actionable error', async () => {
    const provider = new FakeAiProvider({ outlineMarkdown: '# Broken outline\n\nNo sections.' });
    const context = await appContext({ provider });
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);

    await request(context.app).post(`/api/sessions/${session.id}/outline`).expect(202);
    const failed = await waitForStatus(context, session.id, 'failed');
    expect(failed.stage).toBe('outline');
    expect(failed.lastError?.code).toBe('OUTLINE_INVALID');
    expect(failed.outlineRaw).toContain('Broken outline');
  });

  it('pauses after the current section and resumes from that checkpoint', async () => {
    const provider = new FakeAiProvider({ chunkSize: 16, delayMs: 12 });
    const context = await appContext({ provider });
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    await outlineAndApprove(context, session.id);

    await waitFor(
      () => getSession(context, session.id),
      (current) =>
        current.status === 'expanding' &&
        current.sections.some((section) => section.status === 'completed') &&
        current.sections.some((section) => section.status === 'running'),
    );

    await request(context.app).post(`/api/sessions/${session.id}/pause`).expect(202);
    const paused = await waitForStatus(context, session.id, 'paused');
    expect(paused.pauseReason).toBe('user');
    expect(paused.sections.some((section) => section.status === 'completed')).toBe(true);
    expect(paused.sections.some((section) => section.status === 'running')).toBe(false);

    await request(context.app).post(`/api/sessions/${session.id}/resume`).expect(202);
    await waitForStatus(context, session.id, 'completed');
  }, 15_000);

  it('reports missing keys without changing the session', async () => {
    const context = await appContext({ secrets: new MemorySecretStore(null) });
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);

    const response = await request(context.app)
      .post(`/api/sessions/${session.id}/outline`)
      .expect(409);
    expect(errorOf(response.body).code).toBe('KEY_MISSING');
    expect((await getSession(context, session.id)).status).toBe('draft');

    const health = await request(context.app).get('/api/health').expect(200);
    expect(dataOf(health.body)).toMatchObject({
      status: 'degraded',
      checks: { key: { status: 'degraded' } },
    });
  });

  it('lists active sessions and discards drafts', async () => {
    const context = await appContext();
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);

    const list = await request(context.app).get('/api/sessions?active=true').expect(200);
    expect(dataOf<{ sessions: Array<{ id: string }> }>(list.body).sessions).toHaveLength(1);

    const invalidQuery = await request(context.app).get('/api/sessions?active=false').expect(400);
    expect(errorOf(invalidQuery.body).code).toBe('VALIDATION_FAILED');

    const deleted = await request(context.app).delete(`/api/sessions/${session.id}`).expect(200);
    expect(deleteSessionResponseSchema.parse(dataOf(deleted.body))).toEqual({
      deletedId: session.id,
    });
    await request(context.app).get(`/api/sessions/${session.id}`).expect(404);
  });

  it('recovers interrupted sessions as paused without losing completed sections', async () => {
    const context = await appContext();
    const fixture = createSessionFixture({
      status: 'expanding',
      stage: 'sections',
      activeSectionNumber: 2,
      sections: [
        {
          number: 1,
          title: 'One',
          bullets: [],
          wordBudget: 500,
          prompt: {
            version: '1',
            sectionNumber: 1,
            sectionTitle: 'One',
            wordBudget: 500,
            system: 's',
            user: 'u',
            estimatedTokens: 1,
          },
          status: 'completed',
          markdown: 'Done.',
        },
        {
          number: 2,
          title: 'Two',
          bullets: [],
          wordBudget: 500,
          prompt: {
            version: '1',
            sectionNumber: 2,
            sectionTitle: 'Two',
            wordBudget: 500,
            system: 's',
            user: 'u',
            estimatedTokens: 1,
          },
          status: 'running',
        },
      ],
    });
    await writeFile(
      path.join(context.dataDir, 'sessions', `${fixture.id}.json`),
      `${JSON.stringify(fixture)}
`,
      'utf8',
    );
    await context.sessionService.recoverInterrupted();

    const recovered = await getSession(context, fixture.id);
    expect(recovered.status).toBe('paused');
    expect(recovered.pauseReason).toBe('interrupted');
    expect(recovered.sections[0]?.status).toBe('completed');
    expect(recovered.sections[1]?.status).toBe('pending');
    expect(recovered.activeSectionNumber).toBeUndefined();
  });

  it('returns a session summary from action endpoints', async () => {
    const context = await appContext();
    const subjectId = await createSubject(context);
    const session = await createDraft(context, subjectId);
    const response = await request(context.app)
      .post(`/api/sessions/${session.id}/outline`)
      .expect(202);
    const summary = sessionSummaryResponseSchema.parse(dataOf(response.body)).session;
    expect(summary.status).toBe('generating_outline');
    expect(summary.sectionCount).toBe(0);
  });
});
