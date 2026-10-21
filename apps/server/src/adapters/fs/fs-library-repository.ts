import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import {
  LIBRARY_SCHEMA_VERSION,
  SUBJECT_NAME_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  courseMetadataSchema,
  libraryIndexFileSchema,
  subjectMetadataSchema,
  type CourseDetail,
  type CourseMetadata,
  type CourseSummary,
  type LibraryIndexFile,
  type ScanWarning,
  type SubjectMetadata,
  type SubjectSummary,
} from '@ccb/contracts';

import { LibraryError } from '../../domain/library-errors.js';
import { libraryWarning } from '../../domain/library-warnings.js';
import {
  normalizeNameForComparison,
  sanitizeFolderName,
  uniqueFolderName,
} from '../../domain/library-naming.js';
import { mergeSubjectOrder } from '../../domain/subject-order.js';
import type {
  CourseMutationResult,
  DeleteCourseResult,
  DeleteSubjectOptions,
  DeleteSubjectResult,
  FinalizeCourseInput,
  FinalizeCourseResult,
  LibraryRepository,
  LibrarySnapshot,
  SubjectMutationResult,
} from '../../ports/library-repository.js';
import { removePath, syncDirectory, writeJsonAtomic, writeTextFileAtomic } from './atomic.js';
import { lstatIfExists, relativeLibraryPath, resolveInside } from './fs-paths.js';
import { readJsonMetadata } from './metadata.js';

interface ScannedCourse {
  folderPath: string;
  metadata: CourseMetadata;
  summary: CourseSummary;
}

interface ScannedSubject {
  folderPath: string;
  metadata: SubjectMetadata;
  courses: ScannedCourse[];
  summary: SubjectSummary;
}

interface InternalScan {
  subjects: ScannedSubject[];
  orderedIds: string[];
  warnings: ScanWarning[];
}

export interface FsLibraryRepositoryOptions {
  root: string;
  now?: () => Date;
  idFactory?: () => string;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isNameEqual(left: string, right: string): boolean {
  return left.normalize('NFC') === right.normalize('NFC');
}

function byUpdatedAtThenTitle(left: CourseSummary, right: CourseSummary): number {
  const dateOrder = right.updatedAt.localeCompare(left.updatedAt);
  return dateOrder !== 0 ? dateOrder : left.title.localeCompare(right.title);
}

export class FsLibraryRepository implements LibraryRepository {
  private readonly root: string;
  private readonly hiddenDirectory: string;
  private readonly stagingDirectory: string;
  private readonly orderPath: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: FsLibraryRepositoryOptions) {
    this.root = path.resolve(options.root);
    this.hiddenDirectory = path.join(this.root, '.crash-course-builder');
    this.stagingDirectory = path.join(this.hiddenDirectory, 'staging');
    this.orderPath = path.join(this.hiddenDirectory, 'library.json');
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const rootStats = await lstatIfExists(this.root);

      if (!rootStats.exists || !rootStats.isDirectory || rootStats.isSymbolicLink) {
        throw new LibraryError(
          'LIBRARY_UNAVAILABLE',
          'The library location must be a real directory, not a file or symbolic link.',
        );
      }

      await mkdir(this.hiddenDirectory, { recursive: true, mode: 0o700 });

      const hiddenStats = await lstatIfExists(this.hiddenDirectory);
      if (!hiddenStats.isDirectory || hiddenStats.isSymbolicLink) {
        throw new LibraryError(
          'LIBRARY_UNAVAILABLE',
          'The library metadata directory is not usable.',
        );
      }

      await this.ensureStagingDirectory();

      const orderStats = await lstatIfExists(this.orderPath);
      if (!orderStats.exists) {
        await writeJsonAtomic(this.orderPath, {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          subjectIds: [],
        } satisfies LibraryIndexFile);
      }
    } catch (error) {
      if (error instanceof LibraryError) {
        throw error;
      }
      throw new LibraryError(
        'LIBRARY_UNAVAILABLE',
        'The library folder could not be prepared. Check that it is writable.',
        {},
        { cause: error },
      );
    }
  }

  async scan(): Promise<LibrarySnapshot> {
    const scan = await this.scanInternal();
    const subjects = scan.subjects.map((subject) => subject.summary);

    return {
      subjects,
      totalCourses: subjects.reduce((total, subject) => total + subject.courses.length, 0),
      warnings: scan.warnings,
    };
  }

  async readCourse(courseId: string): Promise<CourseDetail> {
    const scan = await this.scanInternal();
    const located = this.findCourse(scan.subjects, courseId);

    if (located === undefined) {
      throw new LibraryError('NOT_FOUND', 'The course could not be found.');
    }

    const missing: string[] = [];
    const unreadable: string[] = [];
    let courseMarkdown: string | undefined;
    let outlineMarkdown: string | undefined;

    for (const fileName of ['course.md', 'outline.md'] as const) {
      const filePath = path.join(located.course.folderPath, fileName);
      let stats;

      try {
        stats = await lstatIfExists(filePath);
      } catch (error) {
        throw this.fsFailure(error, `The course file ${fileName} could not be inspected.`);
      }

      if (!stats.exists) {
        missing.push(fileName);
        continue;
      }

      if (!stats.isFile || stats.isSymbolicLink) {
        unreadable.push(fileName);
        continue;
      }

      try {
        const contents = await readFile(filePath, 'utf8');

        if (fileName === 'course.md') {
          courseMarkdown = contents;
        } else {
          outlineMarkdown = contents;
        }
      } catch (error) {
        const code = errorCode(error);

        if (code === 'ENOENT') {
          missing.push(fileName);
          continue;
        }

        throw this.fsFailure(error, `The course file ${fileName} could not be read.`);
      }
    }

    if (missing.length > 0 || unreadable.length > 0) {
      const problems = [...missing, ...unreadable];
      throw new LibraryError(
        'NOT_FOUND',
        'This course is incomplete on disk. Its course.md and outline.md files are required to open it.',
        { files: problems },
      );
    }

    return {
      meta: located.course.metadata,
      outlineMarkdown: outlineMarkdown ?? '',
      courseMarkdown: courseMarkdown ?? '',
    };
  }

  async createSubject(name: string): Promise<SubjectMutationResult> {
    const scan = await this.scanInternal();
    const warnings = [...scan.warnings];
    const existingNames = scan.subjects.map((subject) => path.basename(subject.folderPath));
    const folderName = uniqueFolderName(name, existingNames, SUBJECT_NAME_MAX_LENGTH);
    const folderPath = resolveInside(this.root, folderName);
    const id = this.idFactory();
    const timestamp = this.now().toISOString();

    try {
      await mkdir(folderPath, { mode: 0o700 });
    } catch (error) {
      if (errorCode(error) === 'EEXIST') {
        throw new LibraryError(
          'CONFLICT',
          'A folder with this name appeared while the subject was being created. Try again.',
        );
      }
      throw this.fsFailure(error, 'The subject folder could not be created.');
    }

    const metadata: SubjectMetadata = {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      id,
      name: folderName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await writeJsonAtomic(path.join(folderPath, '.subject.json'), metadata);
    } catch (error) {
      await removePath(folderPath).catch(() => undefined);
      throw this.fsFailure(error, 'The subject metadata could not be written.');
    }

    const subjectIds = [...scan.subjects.map((subject) => subject.metadata.id), id];
    try {
      await this.writeOrder(subjectIds);
    } catch {
      warnings.push(
        libraryWarning(
          'REPAIR_FAILED',
          'The subject was created, but the library order could not be saved.',
        ),
      );
    }

    return {
      subject: {
        id,
        name: folderName,
        createdAt: timestamp,
        updatedAt: timestamp,
        courses: [],
      },
      warnings,
    };
  }

  async renameSubject(id: string, name: string): Promise<SubjectMutationResult> {
    const scan = await this.scanInternal();
    const warnings = [...scan.warnings];
    const subject = scan.subjects.find((entry) => entry.metadata.id === id);

    if (subject === undefined) {
      throw new LibraryError('NOT_FOUND', 'The subject could not be found.');
    }

    const oldName = path.basename(subject.folderPath);
    const existingNames = scan.subjects.map((entry) => path.basename(entry.folderPath));
    const folderName = uniqueFolderName(name, existingNames, SUBJECT_NAME_MAX_LENGTH, oldName);

    if (folderName === oldName) {
      return { subject: subject.summary, warnings };
    }

    const oldPath = subject.folderPath;
    const newPath = resolveInside(this.root, folderName);
    const timestamp = this.now().toISOString();
    const updatedMetadata: SubjectMetadata = {
      ...subject.metadata,
      name: folderName,
      updatedAt: timestamp,
    };
    const oldMetadataPath = path.join(oldPath, '.subject.json');

    try {
      await writeJsonAtomic(oldMetadataPath, updatedMetadata);
    } catch (error) {
      throw this.fsFailure(error, 'The subject could not be renamed.');
    }

    try {
      await this.renameDirectory(oldPath, newPath, oldName, folderName);
    } catch (error) {
      await writeJsonAtomic(oldMetadataPath, subject.metadata).catch(() => undefined);
      throw this.fsFailure(error, 'The subject folder could not be renamed.');
    }

    for (const course of subject.courses) {
      const courseFolder = path.join(newPath, path.basename(course.folderPath));
      const courseMetadataPath = path.join(courseFolder, 'meta.json');
      const repaired: CourseMetadata = {
        ...course.metadata,
        subject: { id: subject.metadata.id, name: folderName },
      };

      try {
        await writeJsonAtomic(courseMetadataPath, repaired);
      } catch {
        warnings.push(
          libraryWarning(
            'REPAIR_FAILED',
            'A course could not be updated after the subject rename. It will be repaired on the next scan.',
            relativeLibraryPath(this.root, courseMetadataPath),
          ),
        );
      }
    }

    const courses = subject.courses
      .map((course) => ({ ...course.summary }))
      .sort(byUpdatedAtThenTitle);

    return {
      subject: {
        id: subject.metadata.id,
        name: folderName,
        createdAt: subject.metadata.createdAt,
        updatedAt: timestamp,
        courses,
      },
      warnings,
    };
  }

  async reorderSubjects(
    subjectIds: string[],
  ): Promise<{ subjectIds: string[]; warnings: ScanWarning[] }> {
    const scan = await this.scanInternal();
    const currentIds = scan.subjects.map((subject) => subject.metadata.id);
    const requested = new Set(subjectIds);

    if (requested.size !== subjectIds.length) {
      throw new LibraryError(
        'VALIDATION_FAILED',
        'Each subject must appear exactly once in the order.',
      );
    }

    const currentSet = new Set(currentIds);
    const sameSet =
      requested.size === currentSet.size &&
      subjectIds.every((subjectId) => currentSet.has(subjectId));

    if (!sameSet) {
      throw new LibraryError(
        'CONFLICT',
        'The library changed while it was being reordered. Refresh and try again.',
        { reason: 'stale_order', currentSubjectIds: currentIds },
      );
    }

    try {
      await this.writeOrder(subjectIds);
    } catch (error) {
      throw this.fsFailure(error, 'The new subject order could not be saved.');
    }

    return { subjectIds: [...subjectIds], warnings: scan.warnings };
  }

  async moveCourse(courseId: string, subjectId: string): Promise<CourseMutationResult> {
    const scan = await this.scanInternal();
    const warnings = [...scan.warnings];
    const source = this.findCourse(scan.subjects, courseId);
    const targetSubject = scan.subjects.find((subject) => subject.metadata.id === subjectId);

    if (source === undefined) {
      throw new LibraryError('NOT_FOUND', 'The course could not be found.');
    }
    if (targetSubject === undefined) {
      throw new LibraryError('NOT_FOUND', 'The destination subject could not be found.');
    }

    if (source.subject.metadata.id === targetSubject.metadata.id) {
      return { course: source.course.summary, warnings };
    }

    const targetNames = targetSubject.courses.map((course) => path.basename(course.folderPath));
    const requestedFolderName = sanitizeFolderName(source.course.metadata.topic, TOPIC_MAX_LENGTH);
    let folderName = uniqueFolderName(requestedFolderName, targetNames, TOPIC_MAX_LENGTH);
    let destination = resolveInside(targetSubject.folderPath, folderName);
    let moved = false;

    for (let attempt = 0; attempt < 20 && !moved; attempt += 1) {
      try {
        await rename(source.course.folderPath, destination);
        moved = true;
      } catch (error) {
        const code = errorCode(error);
        if (code === 'EEXIST' || code === 'ENOTEMPTY') {
          targetNames.push(folderName);
          folderName = uniqueFolderName(requestedFolderName, targetNames, TOPIC_MAX_LENGTH);
          destination = resolveInside(targetSubject.folderPath, folderName);
          continue;
        }
        throw this.fsFailure(error, 'The course folder could not be moved.');
      }
    }

    if (!moved) {
      throw new LibraryError(
        'CONFLICT',
        'A folder with this course name already exists in the destination subject.',
      );
    }

    const timestamp = this.now().toISOString();
    const updatedMetadata: CourseMetadata = {
      ...source.course.metadata,
      subject: { id: targetSubject.metadata.id, name: targetSubject.metadata.name },
      updatedAt: timestamp,
    };

    try {
      await writeJsonAtomic(path.join(destination, 'meta.json'), updatedMetadata);
    } catch {
      warnings.push(
        libraryWarning(
          'REPAIR_FAILED',
          'The course moved, but its metadata could not be updated. It will be repaired on the next scan.',
          relativeLibraryPath(this.root, path.join(destination, 'meta.json')),
        ),
      );
    }

    return {
      course: {
        ...source.course.summary,
        subjectId: targetSubject.metadata.id,
        updatedAt: timestamp,
      },
      warnings,
    };
  }

  async finalizeCourse(input: FinalizeCourseInput): Promise<FinalizeCourseResult> {
    const scan = await this.scanInternal();
    const warnings = [...scan.warnings];
    const existing = this.findCourse(scan.subjects, input.courseId);

    if (existing !== undefined) {
      return {
        course: existing.course.summary,
        relativePath: relativeLibraryPath(this.root, existing.course.folderPath),
        warnings,
      };
    }

    if (input.metadata.id !== input.courseId) {
      throw new LibraryError(
        'VALIDATION_FAILED',
        'The assembled course identity does not match the reserved course id.',
      );
    }

    const subject = scan.subjects.find((entry) => entry.metadata.id === input.subjectId);

    if (subject === undefined) {
      throw new LibraryError(
        'NOT_FOUND',
        'The destination subject no longer exists. Recreate it or discard this session.',
      );
    }

    const metadata: CourseMetadata = courseMetadataSchema.parse({
      ...input.metadata,
      subject: { id: subject.metadata.id, name: subject.metadata.name },
    });
    const stagePath = path.join(this.stagingDirectory, `finalize-${input.courseId}`);

    try {
      await this.ensureStagingDirectory();
      await removePath(stagePath);
      await mkdir(stagePath, { mode: 0o700 });
      await writeTextFileAtomic(path.join(stagePath, 'course.md'), input.courseMarkdown);
      await writeTextFileAtomic(path.join(stagePath, 'outline.md'), input.outlineMarkdown);
      await writeJsonAtomic(path.join(stagePath, 'meta.json'), metadata);
      await syncDirectory(stagePath);
    } catch (error) {
      await removePath(stagePath).catch(() => undefined);
      throw this.fsFailure(error, 'The course could not be prepared for saving.');
    }

    const targetNames = subject.courses.map((course) => path.basename(course.folderPath));
    let folderName = uniqueFolderName(input.folderName, targetNames, TOPIC_MAX_LENGTH);
    let destination = resolveInside(subject.folderPath, folderName);
    let moved = false;

    for (let attempt = 0; attempt < 20 && !moved; attempt += 1) {
      try {
        await rename(stagePath, destination);
        moved = true;
      } catch (error) {
        const code = errorCode(error);
        if (code === 'EEXIST' || code === 'ENOTEMPTY') {
          targetNames.push(folderName);
          folderName = uniqueFolderName(input.folderName, targetNames, TOPIC_MAX_LENGTH);
          destination = resolveInside(subject.folderPath, folderName);
          continue;
        }
        await removePath(stagePath).catch(() => undefined);
        throw this.fsFailure(error, 'The finished course could not be moved into the library.');
      }
    }

    if (!moved) {
      await removePath(stagePath).catch(() => undefined);
      throw new LibraryError(
        'CONFLICT',
        'A folder with this course name already exists in the destination subject.',
      );
    }

    await syncDirectory(subject.folderPath).catch(() => undefined);

    return {
      course: {
        id: metadata.id,
        subjectId: subject.metadata.id,
        topic: metadata.topic,
        title: metadata.title,
        audience: metadata.audience,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        status: metadata.status,
        stats: metadata.stats,
      },
      relativePath: relativeLibraryPath(this.root, destination),
      warnings,
    };
  }

  async deleteCourse(courseId: string): Promise<DeleteCourseResult> {
    const scan = await this.scanInternal();
    const warnings = [...scan.warnings];
    const located = this.findCourse(scan.subjects, courseId);

    if (located === undefined) {
      throw new LibraryError('NOT_FOUND', 'The course could not be found.');
    }

    const stagedPath = path.join(this.stagingDirectory, `delete-course-${this.idFactory()}`);

    try {
      await this.ensureStagingDirectory();
      await rename(located.course.folderPath, stagedPath);
    } catch (error) {
      throw this.fsFailure(error, 'The course folder could not be deleted.');
    }

    try {
      await removePath(stagedPath);
    } catch {
      warnings.push(
        libraryWarning(
          'DELETE_CLEANUP_FAILED',
          'The course was removed from the library, but its hidden cleanup folder could not be deleted.',
        ),
      );
    }

    return { deletedId: courseId, warnings };
  }

  async deleteSubject(id: string, options: DeleteSubjectOptions): Promise<DeleteSubjectResult> {
    const scan = await this.scanInternal();
    const warnings = [...scan.warnings];
    const subject = scan.subjects.find((entry) => entry.metadata.id === id);

    if (subject === undefined) {
      throw new LibraryError('NOT_FOUND', 'The subject could not be found.');
    }

    const courseCount = subject.courses.length;

    if (courseCount > 0) {
      if (!options.cascade) {
        throw new LibraryError(
          'CONFLICT',
          'This subject contains courses. Confirm a cascade delete to remove them.',
          { courseCount, subjectName: subject.summary.name },
        );
      }

      if (options.confirmName?.trim() !== subject.summary.name) {
        throw new LibraryError(
          'VALIDATION_FAILED',
          'Type the subject name exactly to confirm deleting its courses.',
          { field: 'confirmName' },
        );
      }
    }

    const stagedPath = path.join(this.stagingDirectory, `delete-subject-${this.idFactory()}`);

    try {
      await this.ensureStagingDirectory();
      await rename(subject.folderPath, stagedPath);
    } catch (error) {
      throw this.fsFailure(error, 'The subject folder could not be deleted.');
    }

    try {
      await removePath(stagedPath);
    } catch {
      warnings.push(
        libraryWarning(
          'DELETE_CLEANUP_FAILED',
          'The subject was removed from the library, but its hidden cleanup folder could not be deleted.',
        ),
      );
    }

    const remainingIds = scan.subjects
      .filter((entry) => entry.metadata.id !== id)
      .map((entry) => entry.metadata.id);

    try {
      await this.writeOrder(remainingIds);
    } catch {
      warnings.push(
        libraryWarning(
          'REPAIR_FAILED',
          'The subject was deleted, but the saved library order could not be updated.',
        ),
      );
    }

    return { deletedId: id, deletedCourses: courseCount, warnings };
  }

  private async scanInternal(): Promise<InternalScan> {
    const warnings: ScanWarning[] = [];
    let rootStats;

    try {
      rootStats = await lstatIfExists(this.root);
    } catch (error) {
      throw this.fsFailure(error, 'The library folder could not be read.');
    }

    if (!rootStats.exists || !rootStats.isDirectory || rootStats.isSymbolicLink) {
      throw new LibraryError(
        'LIBRARY_UNAVAILABLE',
        'The library location must be a readable directory.',
      );
    }

    const orderResult = await readJsonMetadata(this.orderPath, libraryIndexFileSchema);
    const orderWasMissing = orderResult.state === 'missing';
    let orderWasValid = true;
    let orderWasDuplicate = false;
    let orderedIds: string[] = [];

    if (orderResult.state === 'ok') {
      const savedIds = orderResult.value.subjectIds;
      orderedIds = [...new Set(savedIds)];
      orderWasDuplicate = orderedIds.length !== savedIds.length;
    } else if (orderResult.state === 'invalid') {
      orderWasValid = false;
      warnings.push(
        libraryWarning(
          'LIBRARY_ORDER_INVALID',
          'The saved subject order could not be read. It will be rebuilt from the folders.',
          relativeLibraryPath(this.root, this.orderPath),
        ),
      );
    }

    let entries;
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      throw this.fsFailure(error, 'The library folder could not be read.');
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    const subjects: ScannedSubject[] = [];
    const subjectIds = new Set<string>();
    const courseIds = new Set<string>();

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const entryPath = resolveInside(this.root, entry.name);

      if (entry.isSymbolicLink()) {
        warnings.push(
          libraryWarning(
            'SYMLINK_SKIPPED',
            'A symbolic link was skipped for safety.',
            relativeLibraryPath(this.root, entryPath),
          ),
        );
        continue;
      }

      if (!entry.isDirectory()) {
        continue;
      }

      let stats;
      try {
        stats = await lstatIfExists(entryPath);
      } catch {
        warnings.push(
          libraryWarning(
            'SUBJECT_UNREADABLE',
            'This subject folder could not be inspected.',
            relativeLibraryPath(this.root, entryPath),
          ),
        );
        continue;
      }

      if (!stats.isDirectory || stats.isSymbolicLink) {
        warnings.push(
          libraryWarning(
            'SUBJECT_UNREADABLE',
            'This subject folder is not a real directory.',
            relativeLibraryPath(this.root, entryPath),
          ),
        );
        continue;
      }

      const metadataPath = path.join(entryPath, '.subject.json');
      const metadataResult = await readJsonMetadata(metadataPath, subjectMetadataSchema);
      let metadata: SubjectMetadata;

      if (metadataResult.state === 'missing') {
        const timestamp = this.now().toISOString();
        const adopted: SubjectMetadata = {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          id: this.idFactory(),
          name: entry.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        try {
          await writeJsonAtomic(metadataPath, adopted);
          metadata = adopted;
          warnings.push(
            libraryWarning(
              'SUBJECT_ADOPTED',
              'A subject folder was found and added to the library.',
              relativeLibraryPath(this.root, entryPath),
            ),
          );
        } catch {
          warnings.push(
            libraryWarning(
              'SUBJECT_UNREADABLE',
              'This subject folder could not be adopted because its metadata is not writable.',
              relativeLibraryPath(this.root, entryPath),
            ),
          );
          continue;
        }
      } else if (metadataResult.state === 'invalid') {
        warnings.push(
          libraryWarning(
            'SUBJECT_METADATA_INVALID',
            'This subject has unreadable metadata and was left untouched.',
            relativeLibraryPath(this.root, metadataPath),
          ),
        );
        continue;
      } else {
        metadata = metadataResult.value;
      }

      if (subjectIds.has(metadata.id)) {
        warnings.push(
          libraryWarning(
            'SUBJECT_ID_DUPLICATE',
            'Another subject uses the same identifier. This folder was skipped to avoid overwriting data.',
            relativeLibraryPath(this.root, entryPath),
          ),
        );
        continue;
      }

      if (!isNameEqual(metadata.name, entry.name)) {
        const repaired = { ...metadata, name: entry.name };
        try {
          await writeJsonAtomic(metadataPath, repaired);
          metadata = repaired;
          warnings.push(
            libraryWarning(
              'SUBJECT_NAME_REPAIRED',
              'The subject name was repaired to match its folder.',
              relativeLibraryPath(this.root, entryPath),
            ),
          );
        } catch {
          warnings.push(
            libraryWarning(
              'REPAIR_FAILED',
              'The subject name could not be repaired. Its folder name will still be used.',
              relativeLibraryPath(this.root, metadataPath),
            ),
          );
        }
      }

      subjectIds.add(metadata.id);
      const courses = await this.scanCourses(entryPath, metadata, courseIds, warnings);
      const summary: SubjectSummary = {
        id: metadata.id,
        name: entry.name,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        courses: courses.map((course) => course.summary).sort(byUpdatedAtThenTitle),
      };

      subjects.push({ folderPath: entryPath, metadata, courses, summary });
    }

    const merged = mergeSubjectOrder(
      orderedIds,
      subjects.map((subject) => subject.summary),
    );
    const subjectById = new Map(subjects.map((subject) => [subject.metadata.id, subject]));
    const orderedSubjects = merged.subjectIds
      .map((id) => subjectById.get(id))
      .filter((subject): subject is ScannedSubject => subject !== undefined);
    const orderChanged =
      orderWasMissing ||
      !orderWasValid ||
      orderWasDuplicate ||
      orderedIds.length !== merged.subjectIds.length ||
      orderedIds.some((id, index) => id !== merged.subjectIds[index]);

    if (orderChanged) {
      try {
        await this.writeOrder(merged.subjectIds);
      } catch {
        warnings.push(
          libraryWarning(
            'REPAIR_FAILED',
            'The library order could not be saved. The folder order will be used for now.',
          ),
        );
      }
    }

    return { subjects: orderedSubjects, orderedIds: merged.subjectIds, warnings };
  }

  private async scanCourses(
    subjectPath: string,
    subject: SubjectMetadata,
    knownCourseIds: Set<string>,
    warnings: ScanWarning[],
  ): Promise<ScannedCourse[]> {
    let entries;
    try {
      entries = await readdir(subjectPath, { withFileTypes: true });
    } catch {
      warnings.push(
        libraryWarning(
          'SUBJECT_UNREADABLE',
          'Courses in this subject folder could not be read.',
          relativeLibraryPath(this.root, subjectPath),
        ),
      );
      return [];
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    const courses: ScannedCourse[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const coursePath = resolveInside(subjectPath, entry.name);

      if (entry.isSymbolicLink()) {
        warnings.push(
          libraryWarning(
            'SYMLINK_SKIPPED',
            'A symbolic link was skipped for safety.',
            relativeLibraryPath(this.root, coursePath),
          ),
        );
        continue;
      }

      if (!entry.isDirectory()) {
        continue;
      }

      const metadataPath = path.join(coursePath, 'meta.json');
      const metadataResult = await readJsonMetadata(metadataPath, courseMetadataSchema);

      if (metadataResult.state === 'missing') {
        const nested = await this.containsNestedDirectory(coursePath);
        warnings.push(
          nested
            ? libraryWarning(
                'NESTED_DIRECTORY',
                'Nested folders are not treated as subjects or courses. Move a valid course folder directly into the subject.',
                relativeLibraryPath(this.root, coursePath),
              )
            : libraryWarning(
                'COURSE_METADATA_MISSING',
                'This folder has no course metadata and was not added to the library.',
                relativeLibraryPath(this.root, coursePath),
              ),
        );
        continue;
      }

      if (metadataResult.state === 'invalid') {
        warnings.push(
          libraryWarning(
            'COURSE_METADATA_INVALID',
            'This course has unreadable metadata and was left untouched.',
            relativeLibraryPath(this.root, metadataPath),
          ),
        );
        continue;
      }

      let metadata = metadataResult.value;

      if (knownCourseIds.has(metadata.id)) {
        warnings.push(
          libraryWarning(
            'COURSE_ID_DUPLICATE',
            'Another course uses the same identifier. This folder was skipped to avoid overwriting data.',
            relativeLibraryPath(this.root, coursePath),
          ),
        );
        continue;
      }

      const missingFiles: string[] = [];
      for (const fileName of ['course.md', 'outline.md']) {
        const fileStats = await lstatIfExists(path.join(coursePath, fileName));
        if (!fileStats.exists || !fileStats.isFile || fileStats.isSymbolicLink) {
          missingFiles.push(fileName);
        }
      }

      if (missingFiles.length > 0) {
        warnings.push(
          libraryWarning(
            'COURSE_FILES_MISSING',
            `This course is missing ${missingFiles.join(' and ')}. It is still listed so it can be managed.`,
            relativeLibraryPath(this.root, coursePath),
          ),
        );
      }

      if (metadata.subject.id !== subject.id || !isNameEqual(metadata.subject.name, subject.name)) {
        const repaired: CourseMetadata = {
          ...metadata,
          subject: { id: subject.id, name: subject.name },
        };

        try {
          await writeJsonAtomic(metadataPath, repaired);
          metadata = repaired;
          warnings.push(
            libraryWarning(
              'COURSE_SUBJECT_REPAIRED',
              'The course location was used to repair its subject metadata.',
              relativeLibraryPath(this.root, metadataPath),
            ),
          );
        } catch {
          warnings.push(
            libraryWarning(
              'REPAIR_FAILED',
              'The course subject metadata could not be repaired. Its folder location is still used.',
              relativeLibraryPath(this.root, metadataPath),
            ),
          );
        }
      }

      knownCourseIds.add(metadata.id);

      courses.push({
        folderPath: coursePath,
        metadata,
        summary: {
          id: metadata.id,
          subjectId: subject.id,
          topic: metadata.topic,
          title: metadata.title,
          audience: metadata.audience,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          status: metadata.status,
          stats: metadata.stats,
        },
      });
    }

    return courses.sort((left, right) => byUpdatedAtThenTitle(left.summary, right.summary));
  }

  private async ensureStagingDirectory(): Promise<void> {
    await mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 });
    const stats = await lstatIfExists(this.stagingDirectory);

    if (!stats.isDirectory || stats.isSymbolicLink) {
      throw new LibraryError(
        'LIBRARY_UNAVAILABLE',
        'The hidden staging area is not a real directory.',
      );
    }
  }

  private async containsNestedDirectory(directory: string): Promise<boolean> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.some(
        (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.isSymbolicLink(),
      );
    } catch {
      return false;
    }
  }

  private findCourse(
    subjects: ScannedSubject[],
    courseId: string,
  ): { subject: ScannedSubject; course: ScannedCourse } | undefined {
    for (const subject of subjects) {
      const course = subject.courses.find((entry) => entry.metadata.id === courseId);
      if (course !== undefined) {
        return { subject, course };
      }
    }

    return undefined;
  }

  private async writeOrder(subjectIds: string[]): Promise<void> {
    const order: LibraryIndexFile = {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      subjectIds,
    };
    await writeJsonAtomic(this.orderPath, order);
  }

  private async renameDirectory(
    source: string,
    destination: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const caseOnly =
      normalizeNameForComparison(oldName) === normalizeNameForComparison(newName) &&
      oldName !== newName;

    if (!caseOnly) {
      await rename(source, destination);
      return;
    }

    await this.ensureStagingDirectory();
    const temporary = path.join(this.stagingDirectory, `case-rename-${this.idFactory()}`);
    await rename(source, temporary);
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rename(temporary, source).catch(() => undefined);
      throw error;
    }
  }

  private fsFailure(error: unknown, message: string): LibraryError {
    if (error instanceof LibraryError) {
      return error;
    }

    const code = errorCode(error);
    if (
      code === 'EACCES' ||
      code === 'EPERM' ||
      code === 'EROFS' ||
      code === 'ENOSPC' ||
      code === 'ENOTDIR' ||
      code === 'EMFILE' ||
      code === 'ENFILE'
    ) {
      return new LibraryError('LIBRARY_UNAVAILABLE', message, {}, { cause: error });
    }

    return new LibraryError('LIBRARY_SCAN_FAILED', message, {}, { cause: error });
  }
}
