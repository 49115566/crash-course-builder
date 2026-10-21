import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createTempDirectory,
  IDS,
  makeCourseMetadata,
  makeRepository,
  readCourseMetadata,
} from '../../test/library-fixtures.js';

describe('course finalization', () => {
  it('writes all three files into the subject through hidden staging', async () => {
    const root = await createTempDirectory('ccb-finalize-');
    const repository = makeRepository(root);
    await repository.initialize();
    const subject = (await repository.createSubject('Computer Science')).subject;
    const metadata = makeCourseMetadata(IDS.courseA, { id: subject.id, name: subject.name });

    try {
      const result = await repository.finalizeCourse({
        courseId: metadata.id,
        subjectId: subject.id,
        folderName: 'Vector Databases',
        metadata,
        courseMarkdown: '# Vector Databases\n\n## 1. Foundations\n\nContent.\n',
        outlineMarkdown: '# Vector Databases\n\n1. Foundations\n',
      });

      const coursePath = path.join(root, 'Computer Science', 'Vector Databases');

      expect(result.relativePath).toBe('Computer Science/Vector Databases');
      expect(result.course.id).toBe(metadata.id);
      expect(await readFile(path.join(coursePath, 'course.md'), 'utf8')).toContain('Foundations');
      expect(await readFile(path.join(coursePath, 'outline.md'), 'utf8')).toContain('1.');
      expect(await readCourseMetadata(coursePath)).toMatchObject({
        id: metadata.id,
        subject: { id: subject.id, name: 'Computer Science' },
      });
      expect((await stat(path.join(coursePath, 'meta.json'))).mode & 0o777).toBe(0o600);
      expect((await stat(path.join(coursePath, 'course.md'))).mode & 0o777).toBe(0o600);
      expect((await stat(path.join(coursePath, 'outline.md'))).mode & 0o777).toBe(0o600);
      expect(
        await readFile(path.join(root, '.crash-course-builder', 'staging'), 'utf8').catch(
          () => 'missing',
        ),
      ).toBe('missing');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is idempotent by course id and suffixes folder collisions', async () => {
    const root = await createTempDirectory('ccb-finalize-');
    const repository = makeRepository(root);
    await repository.initialize();
    const subject = (await repository.createSubject('Computer Science')).subject;
    const first = makeCourseMetadata(IDS.courseA, { id: subject.id, name: subject.name });
    const second = makeCourseMetadata(
      IDS.courseB,
      { id: subject.id, name: subject.name },
      { topic: 'Vector Databases' },
    );

    try {
      await repository.finalizeCourse({
        courseId: first.id,
        subjectId: subject.id,
        folderName: 'Vector Databases',
        metadata: first,
        courseMarkdown: '# First\n',
        outlineMarkdown: '# First\n',
      });
      const repeated = await repository.finalizeCourse({
        courseId: first.id,
        subjectId: subject.id,
        folderName: 'Vector Databases',
        metadata: first,
        courseMarkdown: '# Changed\n',
        outlineMarkdown: '# Changed\n',
      });
      const collided = await repository.finalizeCourse({
        courseId: second.id,
        subjectId: subject.id,
        folderName: 'Vector Databases',
        metadata: second,
        courseMarkdown: '# Second\n',
        outlineMarkdown: '# Second\n',
      });

      expect(repeated.relativePath).toBe('Computer Science/Vector Databases');
      expect(collided.relativePath).toBe('Computer Science/Vector Databases (2)');
      expect(await readFile(path.join(root, repeated.relativePath, 'course.md'), 'utf8')).toBe(
        '# First\n',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails clearly when the destination subject disappeared', async () => {
    const root = await createTempDirectory('ccb-finalize-');
    const repository = makeRepository(root);
    await repository.initialize();
    const subject = (await repository.createSubject('Temporary')).subject;
    const metadata = makeCourseMetadata(IDS.courseA, { id: subject.id, name: subject.name });
    await rm(path.join(root, 'Temporary'), { recursive: true, force: true });

    try {
      await expect(
        repository.finalizeCourse({
          courseId: metadata.id,
          subjectId: subject.id,
          folderName: 'Vector Databases',
          metadata,
          courseMarkdown: '# Course\n',
          outlineMarkdown: '# Course\n',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not leave a partially visible course when staging fails', async () => {
    const root = await createTempDirectory('ccb-finalize-');
    const repository = makeRepository(root);
    await repository.initialize();
    const subject = (await repository.createSubject('Computer Science')).subject;
    const metadata = makeCourseMetadata(IDS.courseA, { id: subject.id, name: subject.name });
    const stagingPath = path.join(root, '.crash-course-builder', 'staging');
    await rm(stagingPath, { recursive: true, force: true });
    await writeFile(stagingPath, 'not a directory', 'utf8');

    try {
      await expect(
        repository.finalizeCourse({
          courseId: metadata.id,
          subjectId: subject.id,
          folderName: 'Vector Databases',
          metadata,
          courseMarkdown: '# Course\n',
          outlineMarkdown: '# Course\n',
        }),
      ).rejects.toBeTruthy();
      await expect(
        stat(path.join(root, 'Computer Science', 'Vector Databases')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
