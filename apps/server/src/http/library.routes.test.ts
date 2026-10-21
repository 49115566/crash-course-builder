import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  apiSuccessSchema,
  courseDetailSchema,
  deleteSubjectResponseSchema,
  libraryDataSchema,
  subjectMutationResponseSchema,
  type ApiError,
} from '@ccb/contracts';
import { apiRequest } from '../test/api-request.js';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryService } from '../app/library-service.js';
import { createApp } from './app.js';
import {
  IDS,
  createTempDirectory,
  makeCourseMetadata,
  makeRepository,
  makeTestApp,
  readOrderFile,
  seedCourse,
  type TestAppContext,
} from '../test/library-fixtures.js';
import { makeConfig, makeSilentLogger } from '../test/test-config.js';

const contexts: TestAppContext[] = [];

async function appContext(): Promise<TestAppContext> {
  const context = await makeTestApp();
  contexts.push(context);
  return context;
}

function dataOf(body: unknown): unknown {
  return (body as { data?: unknown }).data;
}

function errorOf(body: unknown): ApiError['error'] {
  return (body as ApiError).error;
}

function warningsOf(body: unknown): unknown {
  return (body as { warnings?: unknown }).warnings;
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.cleanup()));
});

describe('library API', () => {
  it('returns an empty library with the success envelope', async () => {
    const { app } = await appContext();
    const response = await apiRequest(app).get('/api/library').expect(200);
    const parsed = apiSuccessSchema(libraryDataSchema).parse(response.body as unknown);

    expect(parsed.data).toEqual({ subjects: [], totalCourses: 0 });
    expect(parsed.warnings).toBeUndefined();
  });

  it('creates a subject and persists its folder and order', async () => {
    const { app, libraryRoot } = await appContext();
    const response = await apiRequest(app)
      .post('/api/subjects')
      .send({ name: 'Computer Science' })
      .expect(201);
    const parsed = subjectMutationResponseSchema.parse(dataOf(response.body));

    expect(parsed.subject.name).toBe('Computer Science');
    expect((await readOrderFile(libraryRoot)).subjectIds).toEqual([parsed.subject.id]);
    await expect(
      stat(path.join(libraryRoot, 'Computer Science', '.subject.json')),
    ).resolves.toBeTruthy();
  });

  it('rejects invalid subject names with actionable validation details', async () => {
    const { app } = await appContext();

    for (const name of ['', '   ', '../escape', 'a/b', 'CON']) {
      const response = await apiRequest(app).post('/api/subjects').send({ name }).expect(400);
      const error = errorOf(response.body);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.message).toBeTruthy();
    }
  });

  it('rejects unknown request fields', async () => {
    const { app } = await appContext();
    const response = await apiRequest(app)
      .post('/api/subjects')
      .send({ name: 'Math', extra: true })
      .expect(400);

    expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('renames a subject', async () => {
    const { app, libraryRoot } = await appContext();
    const created = await apiRequest(app).post('/api/subjects').send({ name: 'Old' }).expect(201);
    const id = subjectMutationResponseSchema.parse(dataOf(created.body)).subject.id;

    const response = await apiRequest(app)
      .patch(`/api/subjects/${id}`)
      .send({ name: 'New' })
      .expect(200);

    expect(subjectMutationResponseSchema.parse(dataOf(response.body)).subject.name).toBe('New');
    await expect(stat(path.join(libraryRoot, 'New'))).resolves.toBeTruthy();
    await expect(stat(path.join(libraryRoot, 'Old'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns 404 for an unknown subject and 400 for a malformed id', async () => {
    const { app } = await appContext();

    await apiRequest(app).patch(`/api/subjects/${IDS.subjectA}`).send({ name: 'New' }).expect(404);
    await apiRequest(app).patch('/api/subjects/not-a-uuid').send({ name: 'New' }).expect(400);
  });

  it('persists subject order and rejects stale orders', async () => {
    const { app } = await appContext();
    const first = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'First' }).expect(201)).body,
      ),
    ).subject;
    const second = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'Second' }).expect(201)).body,
      ),
    ).subject;

    const response = await apiRequest(app)
      .put('/api/subjects/order')
      .send({ subjectIds: [second.id, first.id] })
      .expect(200);

    expect((dataOf(response.body) as { subjectIds: string[] }).subjectIds).toEqual([
      second.id,
      first.id,
    ]);

    const stale = await apiRequest(app)
      .put('/api/subjects/order')
      .send({ subjectIds: [first.id] })
      .expect(409);
    expect(errorOf(stale.body)).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'stale_order' },
    });
  });

  it('reads a saved course with exact file contents and no absolute paths', async () => {
    const { app, libraryRoot } = await appContext();
    const subject = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'Computer Science' }).expect(201))
          .body,
      ),
    ).subject;
    const courseMarkdown = '# Vector Databases\n\n## 1. Foundations\n\nUses $x^2$.\n';
    const outlineMarkdown = '# Vector Databases\n\n1. **Foundations**\n';
    await seedCourse(
      path.join(libraryRoot, 'Computer Science'),
      makeCourseMetadata(IDS.courseA, { id: subject.id, name: 'Computer Science' }),
      { courseMarkdown, outlineMarkdown },
    );

    const response = await apiRequest(app).get(`/api/courses/${IDS.courseA}`).expect(200);
    const parsed = apiSuccessSchema(courseDetailSchema).parse(response.body as unknown);

    expect(parsed.data.courseMarkdown).toBe(courseMarkdown);
    expect(parsed.data.outlineMarkdown).toBe(outlineMarkdown);
    expect(parsed.data.meta.id).toBe(IDS.courseA);
    expect(JSON.stringify(response.body)).not.toContain(libraryRoot);
  });

  it('returns 404 for an unknown course and reports missing files safely', async () => {
    const { app, libraryRoot } = await appContext();
    const subject = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'Incomplete' }).expect(201)).body,
      ),
    ).subject;
    await seedCourse(
      path.join(libraryRoot, 'Incomplete'),
      makeCourseMetadata(IDS.courseA, { id: subject.id, name: 'Incomplete' }),
      { courseMarkdown: null },
    );

    const unknown = await apiRequest(app).get(`/api/courses/${IDS.courseB}`).expect(404);
    expect(errorOf(unknown.body).code).toBe('NOT_FOUND');

    const missing = await apiRequest(app).get(`/api/courses/${IDS.courseA}`).expect(404);
    expect(errorOf(missing.body)).toMatchObject({
      code: 'NOT_FOUND',
      details: { files: ['course.md'] },
    });
    expect(JSON.stringify(missing.body)).not.toContain(libraryRoot);
  });

  it('rejects malformed course ids', async () => {
    const { app } = await appContext();

    const response = await apiRequest(app).get('/api/courses/not-a-uuid').expect(400);
    expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('moves and deletes courses', async () => {
    const { app, libraryRoot } = await appContext();
    const first = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'First' }).expect(201)).body,
      ),
    ).subject;
    const second = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'Second' }).expect(201)).body,
      ),
    ).subject;
    await seedCourse(
      path.join(libraryRoot, 'First'),
      makeCourseMetadata(IDS.courseA, { id: first.id, name: 'First' }),
    );

    const moved = await apiRequest(app)
      .post(`/api/courses/${IDS.courseA}/move`)
      .send({ subjectId: second.id })
      .expect(200);

    expect((dataOf(moved.body) as { course: { subjectId: string } }).course.subjectId).toBe(
      second.id,
    );
    await expect(stat(path.join(libraryRoot, 'Second', 'Vector Databases'))).resolves.toBeTruthy();

    await apiRequest(app).delete(`/api/courses/${IDS.courseA}`).send({}).expect(400);
    await apiRequest(app)
      .delete(`/api/courses/${IDS.courseA}`)
      .send({ confirmed: true })
      .expect(200);
    await expect(stat(path.join(libraryRoot, 'Second', 'Vector Databases'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('requires cascade and typed confirmation when deleting a populated subject', async () => {
    const { app, libraryRoot } = await appContext();
    const subject = subjectMutationResponseSchema.parse(
      dataOf(
        (await apiRequest(app).post('/api/subjects').send({ name: 'Populated' }).expect(201)).body,
      ),
    ).subject;
    await seedCourse(
      path.join(libraryRoot, 'Populated'),
      makeCourseMetadata(IDS.courseA, { id: subject.id, name: 'Populated' }),
    );

    const conflict = await apiRequest(app)
      .delete(`/api/subjects/${subject.id}`)
      .send({ confirmed: true })
      .expect(409);
    expect(errorOf(conflict.body).details).toMatchObject({
      courseCount: 1,
      subjectName: 'Populated',
    });

    await apiRequest(app)
      .delete(`/api/subjects/${subject.id}`)
      .send({ confirmed: true, cascade: true, confirmName: 'wrong' })
      .expect(400);

    const response = await apiRequest(app)
      .delete(`/api/subjects/${subject.id}`)
      .send({ confirmed: true, cascade: true, confirmName: 'Populated' })
      .expect(200);
    const parsed = deleteSubjectResponseSchema.parse(dataOf(response.body));

    expect(parsed).toEqual({ deletedId: subject.id, deletedCourses: 1 });
    await expect(stat(path.join(libraryRoot, 'Populated'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('returns scan warnings for manually adopted subjects', async () => {
    const { app, libraryRoot } = await appContext();
    await mkdir(path.join(libraryRoot, 'Manual'));

    const response = await apiRequest(app).get('/api/library').expect(200);

    expect(warningsOf(response.body)).toContainEqual(
      expect.objectContaining({ code: 'SUBJECT_ADOPTED' }),
    );
  });

  it('keeps absolute paths out of scan warnings', async () => {
    const { app, libraryRoot } = await appContext();
    await mkdir(path.join(libraryRoot, 'Manual'));
    const response = await apiRequest(app).get('/api/library').expect(200);

    expect(JSON.stringify(response.body)).not.toContain(libraryRoot);
  });

  it('reports degraded health and a library error when the root is unusable', async () => {
    const temp = await createTempDirectory();
    const fileRoot = path.join(temp, 'library-file');
    await writeFile(fileRoot, 'not a directory', 'utf8');
    const service = new LibraryService(makeRepository(fileRoot));
    const dependencies = await makeTestApp();

    try {
      await expect(service.initialize()).rejects.toBeTruthy();
      const config = makeConfig({ libraryRoot: fileRoot });
      const app = createApp({
        config,
        logger: makeSilentLogger(),
        version: '0.1.0-test',
        libraryService: service,
        sessionService: dependencies.sessionService,
        events: dependencies.events,
        secrets: dependencies.secrets,
      });

      const health = await apiRequest(app).get('/api/health').expect(200);
      expect(dataOf(health.body)).toMatchObject({
        status: 'degraded',
        checks: { library: { status: 'degraded' } },
      });

      const library = await apiRequest(app).get('/api/library').expect(503);
      expect(errorOf(library.body).code).toBe('LIBRARY_UNAVAILABLE');
    } finally {
      await dependencies.cleanup();
      await rm(temp, { recursive: true, force: true });
    }
  });

  it('adds a request id to every response', async () => {
    const { app } = await appContext();
    const response = await apiRequest(app).get('/api/library').expect(200);

    expect(response.headers['x-request-id']).toBeTruthy();
    expect((response.body as { requestId: unknown }).requestId).toBe(
      response.headers['x-request-id'],
    );
  });
});
