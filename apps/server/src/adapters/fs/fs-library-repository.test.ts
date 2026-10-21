import { readdir, readFile, rename, rm, stat, symlink, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { LibraryError } from '../../domain/library-errors.js';
import {
  createTempDirectory,
  IDS,
  makeCourseMetadata,
  makeRepository,
  makeSubjectMetadata,
  readCourseMetadata,
  readOrderFile,
  readSubjectMetadata,
  seedCourse,
  seedSubject,
} from '../../test/library-fixtures.js';
import type { FsLibraryRepository } from './fs-library-repository.js';

describe('FsLibraryRepository', () => {
  let root: string;
  let repository: FsLibraryRepository;

  beforeEach(async () => {
    root = await createTempDirectory();
    repository = makeRepository(root);
    await repository.initialize();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates private library and metadata directories', async () => {
      const libraryStat = await stat(root);
      const hiddenStat = await stat(path.join(root, '.crash-course-builder'));
      const stagingStat = await stat(path.join(root, '.crash-course-builder', 'staging'));
      const order = await readOrderFile(root);

      expect(libraryStat.isDirectory()).toBe(true);
      expect(hiddenStat.mode & 0o777).toBe(0o700);
      expect(stagingStat.mode & 0o777).toBe(0o700);
      expect(order.subjectIds).toEqual([]);
    });

    it('rejects a library path that is a file', async () => {
      const fileRoot = path.join(root, 'not-a-directory');
      await writeFile(fileRoot, 'hello', 'utf8');
      const broken = makeRepository(fileRoot);

      await expect(broken.initialize()).rejects.toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
    });
  });

  describe('subject creation', () => {
    it('creates a subject folder, metadata, and order entry', async () => {
      const result = await repository.createSubject('Computer Science');
      const folderPath = path.join(root, 'Computer Science');
      const metadata = await readSubjectMetadata(folderPath);
      const order = await readOrderFile(root);

      expect(result.subject.name).toBe('Computer Science');
      expect(metadata.id).toBe(result.subject.id);
      expect(order.subjectIds).toEqual([result.subject.id]);
      expect((await stat(folderPath)).mode & 0o777).toBe(0o700);
      expect((await stat(path.join(folderPath, '.subject.json'))).mode & 0o777).toBe(0o600);
      expect(result.warnings).toEqual([]);
    });

    it('uses readable, collision-safe folder names', async () => {
      await repository.createSubject('Math');
      const second = await repository.createSubject('math');
      const third = await repository.createSubject('Math');

      expect(second.subject.name).toBe('math (2)');
      expect(third.subject.name).toBe('Math (3)');
    });

    it('sanitizes illegal folder characters', async () => {
      const result = await repository.createSubject('  A: B  ');

      expect(result.subject.name).toBe('A B');
      await expect(stat(path.join(root, 'A B'))).resolves.toBeTruthy();
    });

    it('rejects path traversal without creating anything', async () => {
      await expect(repository.createSubject('../escape')).rejects.toBeInstanceOf(LibraryError);
      expect(await readdir(root)).not.toContain('escape');
    });
  });

  describe('subject rename', () => {
    it('renames the folder and repairs every course subject name', async () => {
      const created = await repository.createSubject('Computer Science');
      const subjectPath = path.join(root, 'Computer Science');
      await seedCourse(
        subjectPath,
        makeCourseMetadata(IDS.courseA, {
          id: created.subject.id,
          name: 'Computer Science',
        }),
      );

      const result = await repository.renameSubject(created.subject.id, 'Computing');
      const courseMeta = await readCourseMetadata(path.join(root, 'Computing', 'Vector Databases'));

      expect(result.subject.name).toBe('Computing');
      expect((await readSubjectMetadata(path.join(root, 'Computing'))).name).toBe('Computing');
      expect(courseMeta.subject).toEqual({ id: created.subject.id, name: 'Computing' });
      await expect(stat(subjectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('supports case-only renames', async () => {
      const created = await repository.createSubject('math');
      const result = await repository.renameSubject(created.subject.id, 'Math');

      expect(result.subject.name).toBe('Math');
      await expect(stat(path.join(root, 'Math'))).resolves.toBeTruthy();
    });

    it('uses a suffix instead of overwriting an existing subject folder', async () => {
      await repository.createSubject('Math');
      const second = await repository.createSubject('Art');

      const result = await repository.renameSubject(second.subject.id, 'Math');

      expect(result.subject.name).toBe('Math (2)');
      await expect(stat(path.join(root, 'Math'))).resolves.toBeTruthy();
      await expect(stat(path.join(root, 'Math (2)'))).resolves.toBeTruthy();
    });
  });

  describe('ordering', () => {
    it('persists a complete order and returns subjects in that order', async () => {
      const a = await repository.createSubject('Alpha');
      const b = await repository.createSubject('Beta');
      const c = await repository.createSubject('Gamma');

      await repository.reorderSubjects([c.subject.id, a.subject.id, b.subject.id]);
      const snapshot = await repository.scan();

      expect(snapshot.subjects.map((subject) => subject.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
      expect((await readOrderFile(root)).subjectIds).toEqual([
        c.subject.id,
        a.subject.id,
        b.subject.id,
      ]);
    });

    it('rejects duplicate ids and incomplete orders', async () => {
      const a = await repository.createSubject('Alpha');
      const b = await repository.createSubject('Beta');

      await expect(repository.reorderSubjects([a.subject.id, a.subject.id])).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(repository.reorderSubjects([a.subject.id])).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { reason: 'stale_order' },
      });
      await expect(
        repository.reorderSubjects([a.subject.id, b.subject.id, IDS.subjectC]),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('course move and delete', () => {
    it('moves a course and repairs its metadata', async () => {
      const source = await repository.createSubject('Computer Science');
      const target = await repository.createSubject('Marketing');
      await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(IDS.courseA, {
          id: source.subject.id,
          name: 'Computer Science',
        }),
      );

      const result = await repository.moveCourse(IDS.courseA, target.subject.id);
      const movedMeta = await readCourseMetadata(path.join(root, 'Marketing', 'Vector Databases'));

      expect(result.course.subjectId).toBe(target.subject.id);
      expect(movedMeta.subject).toEqual({ id: target.subject.id, name: 'Marketing' });
      await expect(
        stat(path.join(root, 'Computer Science', 'Vector Databases')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('uses a collision suffix when moving into an occupied name', async () => {
      const source = await repository.createSubject('Computer Science');
      const target = await repository.createSubject('Marketing');
      const course = makeCourseMetadata(IDS.courseA, {
        id: source.subject.id,
        name: 'Computer Science',
      });
      await seedCourse(path.join(root, 'Computer Science'), course);
      await seedCourse(path.join(root, 'Marketing'), {
        ...course,
        id: IDS.courseB,
        subject: { id: target.subject.id, name: 'Marketing' },
      });

      await repository.moveCourse(IDS.courseA, target.subject.id);

      expect(await readdir(path.join(root, 'Marketing'))).toContain('Vector Databases (2)');
    });

    it('deletes a course through hidden staging', async () => {
      const subject = await repository.createSubject('Computer Science');
      await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Computer Science',
        }),
      );

      const result = await repository.deleteCourse(IDS.courseA);

      expect(result.deletedId).toBe(IDS.courseA);
      await expect(
        stat(path.join(root, 'Computer Science', 'Vector Databases')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(path.join(root, '.crash-course-builder', 'staging'))).toEqual([]);
    });
  });

  describe('course reading', () => {
    it('returns the exact course files and metadata from disk', async () => {
      const subject = await repository.createSubject('Computer Science');
      const courseMarkdown = '# Vector Databases\n\nA practical course with $x^2$ and tables.\n';
      const outlineMarkdown = '# Vector Databases\n\n1. **Foundations**\n';
      await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Computer Science',
        }),
        { courseMarkdown, outlineMarkdown },
      );

      const result = await repository.readCourse(IDS.courseA);

      expect(result.meta.id).toBe(IDS.courseA);
      expect(result.courseMarkdown).toBe(courseMarkdown);
      expect(result.outlineMarkdown).toBe(outlineMarkdown);
    });

    it('returns NOT_FOUND for unknown and incomplete courses', async () => {
      const subject = await repository.createSubject('Computer Science');
      await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Computer Science',
        }),
        { courseMarkdown: null },
      );
      await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(
          IDS.courseB,
          {
            id: subject.subject.id,
            name: 'Computer Science',
          },
          { topic: 'Graph Databases' },
        ),
        { folderName: 'Graph Databases', outlineMarkdown: null },
      );

      await expect(repository.readCourse(IDS.courseC)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(repository.readCourse(IDS.courseA)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        details: { files: ['course.md'] },
      });
      await expect(repository.readCourse(IDS.courseB)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        details: { files: ['outline.md'] },
      });
    });

    it('refuses to follow symlinked course files', async () => {
      const subject = await repository.createSubject('Computer Science');
      const coursePath = await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Computer Science',
        }),
      );
      const target = path.join(root, 'outside.md');
      await writeFile(target, '# Outside\n', 'utf8');
      await rm(path.join(coursePath, 'course.md'));
      await symlink(target, path.join(coursePath, 'course.md'));

      await expect(repository.readCourse(IDS.courseA)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        details: { files: ['course.md'] },
      });
    });
  });

  describe('staging safety', () => {
    it('refuses to delete through a symlinked staging directory', async () => {
      const subject = await repository.createSubject('Subject');
      await seedCourse(
        path.join(root, 'Subject'),
        makeCourseMetadata(IDS.courseA, { id: subject.subject.id, name: 'Subject' }),
      );
      const outside = await createTempDirectory('ccb-outside-');
      const staging = path.join(root, '.crash-course-builder', 'staging');

      try {
        await rm(staging, { recursive: true, force: true });
        await symlink(outside, staging);

        await expect(repository.deleteCourse(IDS.courseA)).rejects.toMatchObject({
          code: 'LIBRARY_UNAVAILABLE',
        });
        await expect(
          stat(path.join(root, 'Subject', 'Vector Databases', 'meta.json')),
        ).resolves.toBeTruthy();
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe('subject deletion', () => {
    it('deletes an empty subject', async () => {
      const subject = await repository.createSubject('Empty');

      const result = await repository.deleteSubject(subject.subject.id, {
        cascade: false,
      });

      expect(result.deletedCourses).toBe(0);
      await expect(stat(path.join(root, 'Empty'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readOrderFile(root)).subjectIds).toEqual([]);
    });

    it('requires cascade and typed confirmation for subjects with courses', async () => {
      const subject = await repository.createSubject('Computer Science');
      await seedCourse(
        path.join(root, 'Computer Science'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Computer Science',
        }),
      );

      await expect(
        repository.deleteSubject(subject.subject.id, { cascade: false }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { courseCount: 1, subjectName: 'Computer Science' },
      });
      await expect(
        repository.deleteSubject(subject.subject.id, {
          cascade: true,
          confirmName: 'wrong',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      const result = await repository.deleteSubject(subject.subject.id, {
        cascade: true,
        confirmName: 'Computer Science',
      });

      expect(result.deletedCourses).toBe(1);
      await expect(stat(path.join(root, 'Computer Science'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });
  });

  describe('scan reconciliation', () => {
    it('adopts a manually added subject folder', async () => {
      await mkdir(path.join(root, 'Manual Subject'));

      const snapshot = await repository.scan();
      const metadata = await readSubjectMetadata(path.join(root, 'Manual Subject'));

      expect(snapshot.subjects.map((subject) => subject.name)).toEqual(['Manual Subject']);
      expect(metadata.name).toBe('Manual Subject');
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'SUBJECT_ADOPTED' }),
      );
    });

    it('adopts a manually added folder with a long name without rejecting it later', async () => {
      const folderName = 'A'.repeat(100);
      await mkdir(path.join(root, folderName));

      const first = await repository.scan();
      const second = await repository.scan();

      expect(first.subjects.map((subject) => subject.name)).toEqual([folderName]);
      expect(second.subjects.map((subject) => subject.name)).toEqual([folderName]);
      expect(second.warnings.some((warning) => warning.code === 'SUBJECT_METADATA_INVALID')).toBe(
        false,
      );
    });

    it('does not adopt a corrupt subject and leaves it untouched', async () => {
      await mkdir(path.join(root, 'Broken'));
      const original = '{not json';
      await writeFile(path.join(root, 'Broken', '.subject.json'), original, 'utf8');

      const snapshot = await repository.scan();

      expect(snapshot.subjects).toEqual([]);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'SUBJECT_METADATA_INVALID' }),
      );
      expect(await readFile(path.join(root, 'Broken', '.subject.json'), 'utf8')).toBe(original);
    });

    it('uses the folder name after a manual rename and repairs course metadata', async () => {
      const subject = await repository.createSubject('Old Name');
      await seedCourse(
        path.join(root, 'Old Name'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Old Name',
        }),
      );
      await rename(path.join(root, 'Old Name'), path.join(root, 'New Name'));

      const snapshot = await repository.scan();
      const courseMeta = await readCourseMetadata(path.join(root, 'New Name', 'Vector Databases'));

      expect(snapshot.subjects[0]?.name).toBe('New Name');
      expect((await readSubjectMetadata(path.join(root, 'New Name'))).name).toBe('New Name');
      expect(courseMeta.subject.name).toBe('New Name');
      expect(snapshot.warnings.map((warning) => warning.code)).toEqual(
        expect.arrayContaining(['SUBJECT_NAME_REPAIRED', 'COURSE_SUBJECT_REPAIRED']),
      );
    });

    it('repairs an interrupted subject rename idempotently', async () => {
      const subject = await repository.createSubject('Old Name');
      const metadataPath = path.join(root, 'Old Name', '.subject.json');
      const interrupted = {
        ...(await readSubjectMetadata(path.join(root, 'Old Name'))),
        name: 'New Name',
      };
      await writeFile(metadataPath, `${JSON.stringify(interrupted, null, 2)}\n`, 'utf8');
      await seedCourse(
        path.join(root, 'Old Name'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'New Name',
        }),
      );

      const first = await repository.scan();
      const subjectMetadata = await readSubjectMetadata(path.join(root, 'Old Name'));
      const courseMetadata = await readCourseMetadata(
        path.join(root, 'Old Name', 'Vector Databases'),
      );

      expect(first.subjects[0]?.name).toBe('Old Name');
      expect(subjectMetadata.name).toBe('Old Name');
      expect(courseMetadata.subject.name).toBe('Old Name');
      expect(first.warnings).toContainEqual(
        expect.objectContaining({ code: 'SUBJECT_NAME_REPAIRED' }),
      );
      expect(first.warnings).toContainEqual(
        expect.objectContaining({ code: 'COURSE_SUBJECT_REPAIRED' }),
      );

      const second = await repository.scan();

      expect(second.warnings.some((warning) => warning.code === 'SUBJECT_NAME_REPAIRED')).toBe(
        false,
      );
      expect(second.warnings.some((warning) => warning.code === 'COURSE_SUBJECT_REPAIRED')).toBe(
        false,
      );
    });

    it('repairs an interrupted course move without touching its files', async () => {
      const source = await repository.createSubject('Source');
      const target = await repository.createSubject('Target');
      await seedCourse(
        path.join(root, 'Target'),
        makeCourseMetadata(IDS.courseA, {
          id: source.subject.id,
          name: 'Source',
        }),
      );
      const coursePath = path.join(root, 'Target', 'Vector Databases');
      const courseBefore = await readFile(path.join(coursePath, 'course.md'), 'utf8');

      const first = await repository.scan();
      const repaired = await readCourseMetadata(coursePath);

      expect(first.subjects.find((entry) => entry.id === target.subject.id)?.courses).toHaveLength(
        1,
      );
      expect(repaired.subject).toEqual({ id: target.subject.id, name: 'Target' });
      expect(await readFile(path.join(coursePath, 'course.md'), 'utf8')).toBe(courseBefore);

      const second = await repository.scan();
      expect(second.warnings.some((warning) => warning.code === 'COURSE_SUBJECT_REPAIRED')).toBe(
        false,
      );
    });

    it('uses the new folder location after a manual course move', async () => {
      const first = await repository.createSubject('First');
      const second = await repository.createSubject('Second');
      await seedCourse(
        path.join(root, 'First'),
        makeCourseMetadata(IDS.courseA, {
          id: first.subject.id,
          name: 'First',
        }),
      );
      await rename(
        path.join(root, 'First', 'Vector Databases'),
        path.join(root, 'Second', 'Vector Databases'),
      );

      const snapshot = await repository.scan();
      const secondSubject = snapshot.subjects.find((subject) => subject.name === 'Second');

      expect(secondSubject?.courses.map((course) => course.id)).toEqual([IDS.courseA]);
      expect(snapshot.subjects.find((subject) => subject.name === 'First')?.courses).toEqual([]);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'COURSE_SUBJECT_REPAIRED' }),
      );
      expect(second).toBeDefined();
    });

    it('reports nested directories without treating them as courses', async () => {
      await repository.createSubject('Subject');
      await mkdir(path.join(root, 'Subject', 'Nested', 'Inner'), { recursive: true });

      const snapshot = await repository.scan();

      expect(snapshot.subjects[0]?.courses).toEqual([]);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'NESTED_DIRECTORY' }),
      );
    });

    it('warns about course folders without valid metadata and never adopts them', async () => {
      await repository.createSubject('Subject');
      await mkdir(path.join(root, 'Subject', 'No Metadata'));
      await mkdir(path.join(root, 'Subject', 'Corrupt Metadata'));
      await writeFile(path.join(root, 'Subject', 'Corrupt Metadata', 'meta.json'), 'nope', 'utf8');

      const snapshot = await repository.scan();

      expect(snapshot.subjects[0]?.courses).toEqual([]);
      expect(snapshot.warnings.map((warning) => warning.code)).toEqual(
        expect.arrayContaining(['COURSE_METADATA_MISSING', 'COURSE_METADATA_INVALID']),
      );
    });

    it('lists a course with missing markdown files with a warning', async () => {
      const subject = await repository.createSubject('Subject');
      await seedCourse(
        path.join(root, 'Subject'),
        makeCourseMetadata(IDS.courseA, {
          id: subject.subject.id,
          name: 'Subject',
        }),
        { courseMarkdown: null, outlineMarkdown: null },
      );

      const snapshot = await repository.scan();

      expect(snapshot.subjects[0]?.courses).toHaveLength(1);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'COURSE_FILES_MISSING' }),
      );
    });

    it('skips duplicate course ids without overwriting either folder', async () => {
      const subject = await repository.createSubject('Subject');
      const course = makeCourseMetadata(IDS.courseA, {
        id: subject.subject.id,
        name: 'Subject',
      });
      await seedCourse(path.join(root, 'Subject'), course, { folderName: 'First Course' });
      await seedCourse(path.join(root, 'Subject'), course, { folderName: 'Second Course' });

      const snapshot = await repository.scan();

      expect(snapshot.subjects[0]?.courses).toHaveLength(1);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'COURSE_ID_DUPLICATE' }),
      );
      expect(await readdir(path.join(root, 'Subject'))).toContain('Second Course');
    });

    it('skips duplicate subject ids', async () => {
      const metadata = makeSubjectMetadata(IDS.subjectA, 'First');
      await seedSubject(root, metadata, 'First');
      await seedSubject(root, metadata, 'Second');

      const snapshot = await repository.scan();

      expect(snapshot.subjects).toHaveLength(1);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'SUBJECT_ID_DUPLICATE' }),
      );
    });

    it('rebuilds a corrupt order file and warns', async () => {
      await repository.createSubject('Alpha');
      await writeFile(
        path.join(root, '.crash-course-builder', 'library.json'),
        '{"schemaVersion":1,"subjectIds":',
        'utf8',
      );

      const snapshot = await repository.scan();
      const order = await readOrderFile(root);

      expect(snapshot.subjects).toHaveLength(1);
      expect(order.subjectIds).toHaveLength(1);
      expect(snapshot.warnings).toContainEqual(
        expect.objectContaining({ code: 'LIBRARY_ORDER_INVALID' }),
      );
    });

    it('ignores hidden directories, files, and staging contents', async () => {
      await repository.createSubject('Subject');
      await mkdir(path.join(root, '.hidden-subject'));
      await mkdir(path.join(root, '.crash-course-builder', 'staging', 'half-course'));
      await writeFile(path.join(root, 'loose-file.txt'), 'hello', 'utf8');

      const snapshot = await repository.scan();

      expect(snapshot.subjects.map((subject) => subject.name)).toEqual(['Subject']);
    });

    it('skips symbolic links', async () => {
      const outside = await createTempDirectory('ccb-outside-');
      try {
        await symlink(outside, path.join(root, 'Linked Subject'));

        const snapshot = await repository.scan();

        expect(snapshot.subjects).toEqual([]);
        expect(snapshot.warnings).toContainEqual(
          expect.objectContaining({ code: 'SYMLINK_SKIPPED' }),
        );
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });
});
