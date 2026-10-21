import { rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { createSessionFixture } from '../../test/session-fixtures.js';
import { createTempDirectory } from '../../test/library-fixtures.js';
import { makeSilentLogger } from '../../test/test-config.js';
import { FsSessionRepository } from './fs-session-repository.js';

describe('FsSessionRepository', () => {
  let root: string;
  let repository: FsSessionRepository;

  beforeEach(async () => {
    root = await createTempDirectory('ccb-sessions-');
    repository = new FsSessionRepository({ dataDir: root, logger: makeSilentLogger() });
    await repository.initialize();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores sessions atomically with private permissions', async () => {
    const session = createSessionFixture();
    await repository.save(session);

    const file = path.join(root, 'sessions', `${session.id}.json`);
    expect((await stat(path.join(root, 'sessions'))).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(repository.get(session.id)).resolves.toEqual(session);
  });

  it('lists newest first and deletes sessions', async () => {
    const older = createSessionFixture({
      id: '123e4567-e89b-42d3-a456-426614174020',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = createSessionFixture({
      id: '123e4567-e89b-42d3-a456-426614174021',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    await repository.save(older);
    await repository.save(newer);

    await expect(repository.list()).resolves.toEqual([newer, older]);
    await expect(repository.delete(older.id)).resolves.toBe(true);
    await expect(repository.get(older.id)).resolves.toBeNull();
    await expect(repository.delete('not-a-uuid')).resolves.toBe(false);
  });

  it('skips corrupt session files in lists and reports direct reads', async () => {
    const valid = createSessionFixture();
    await repository.save(valid);
    await writeFile(
      path.join(root, 'sessions', '123e4567-e89b-42d3-a456-426614174099.json'),
      '{',
      'utf8',
    );

    await expect(repository.list()).resolves.toEqual([valid]);
    await expect(repository.get('123e4567-e89b-42d3-a456-426614174099')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('prunes only stale drafts', async () => {
    const stale = createSessionFixture({
      id: '123e4567-e89b-42d3-a456-426614174020',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const recent = createSessionFixture({
      id: '123e4567-e89b-42d3-a456-426614174021',
      updatedAt: '2026-01-09T00:00:00.000Z',
    });
    const review = createSessionFixture({
      id: '123e4567-e89b-42d3-a456-426614174022',
      status: 'outline_review',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.save(stale);
    await repository.save(recent);
    await repository.save(review);

    await expect(repository.pruneDrafts(new Date('2026-01-10T00:00:00.000Z'), 7)).resolves.toBe(1);
    await expect(repository.get(stale.id)).resolves.toBeNull();
    await expect(repository.get(recent.id)).resolves.not.toBeNull();
    await expect(repository.get(review.id)).resolves.not.toBeNull();
  });
});
