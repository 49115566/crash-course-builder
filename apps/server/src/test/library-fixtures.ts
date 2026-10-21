import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  courseMetadataSchema,
  libraryIndexFileSchema,
  subjectMetadataSchema,
  type CourseMetadata,
  type LibraryIndexFile,
  type SubjectMetadata,
} from '@ccb/contracts';

import { FsLibraryRepository } from '../adapters/fs/fs-library-repository.js';
import { FsSessionRepository } from '../adapters/fs/fs-session-repository.js';
import { FakeAiProvider } from '../adapters/fake-ai/fake-ai-provider.js';
import { SessionEventBus } from '../app/event-bus.js';
import { GenerationCoordinator } from '../app/generation-coordinator.js';
import { GenerationRunner } from '../app/generation-runner.js';
import { LibraryService } from '../app/library-service.js';
import { SessionService } from '../app/session-service.js';
import { SessionStore } from '../app/session-store.js';
import type { AppConfig } from '../config.js';
import { createApp } from '../http/app.js';
import type { AiProvider } from '../ports/ai-provider.js';
import type {
  ResolvedSecret,
  SecretRemoveResult,
  SecretStore,
  SecretWriteResult,
} from '../ports/secret-store.js';
import { makeConfig, makeSilentLogger } from './test-config.js';

export const IDS = {
  subjectA: '123e4567-e89b-42d3-a456-42661417400a',
  subjectB: '123e4567-e89b-42d3-a456-42661417400b',
  subjectC: '123e4567-e89b-42d3-a456-42661417400c',
  courseA: '123e4567-e89b-42d3-a456-426614174010',
  courseB: '123e4567-e89b-42d3-a456-426614174011',
  courseC: '123e4567-e89b-42d3-a456-426614174012',
} as const;

const FIXED_NOW = new Date('2026-01-10T12:00:00.000Z');

export async function createTempDirectory(prefix = 'ccb-library-'): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export function makeRepository(
  root: string,
  options: { now?: () => Date; idFactory?: () => string } = {},
): FsLibraryRepository {
  return new FsLibraryRepository({
    root,
    now: options.now ?? (() => FIXED_NOW),
    idFactory: options.idFactory ?? randomUUID,
  });
}

export function makeSubjectMetadata(
  id: string,
  name: string,
  overrides: Partial<SubjectMetadata> = {},
): SubjectMetadata {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeCourseMetadata(
  id: string,
  subject: { id: string; name: string },
  overrides: Partial<CourseMetadata> = {},
): CourseMetadata {
  return {
    schemaVersion: 1,
    id,
    subject,
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
    ...overrides,
  };
}

export async function seedSubject(
  root: string,
  metadata: SubjectMetadata,
  folderName = metadata.name,
): Promise<string> {
  const folderPath = path.join(root, folderName);
  await mkdir(folderPath, { recursive: true });
  await writeFile(
    path.join(folderPath, '.subject.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
  return folderPath;
}

export async function seedCourse(
  subjectPath: string,
  metadata: CourseMetadata,
  options: {
    folderName?: string;
    courseMarkdown?: string | null;
    outlineMarkdown?: string | null;
  } = {},
): Promise<string> {
  const folderPath = path.join(subjectPath, options.folderName ?? metadata.topic);
  await mkdir(folderPath, { recursive: true });
  await writeFile(
    path.join(folderPath, 'meta.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  if (options.courseMarkdown !== null) {
    await writeFile(
      path.join(folderPath, 'course.md'),
      options.courseMarkdown ?? '# Vector Databases\n\nA practical course.\n',
      'utf8',
    );
  }
  if (options.outlineMarkdown !== null) {
    await writeFile(
      path.join(folderPath, 'outline.md'),
      options.outlineMarkdown ?? '# Vector Databases\n\n1. Foundations\n',
      'utf8',
    );
  }

  return folderPath;
}

export async function readOrderFile(root: string): Promise<LibraryIndexFile> {
  const contents = await readFile(path.join(root, '.crash-course-builder', 'library.json'), 'utf8');
  return libraryIndexFileSchema.parse(JSON.parse(contents));
}

export async function readSubjectMetadata(folderPath: string): Promise<SubjectMetadata> {
  const contents = await readFile(path.join(folderPath, '.subject.json'), 'utf8');
  return subjectMetadataSchema.parse(JSON.parse(contents));
}

export async function readCourseMetadata(folderPath: string): Promise<CourseMetadata> {
  const contents = await readFile(path.join(folderPath, 'meta.json'), 'utf8');
  return courseMetadataSchema.parse(JSON.parse(contents));
}

export class MemorySecretStore implements SecretStore {
  constructor(public key: string | null = 'test-key') {}

  async resolve(): Promise<ResolvedSecret | null> {
    return this.key === null ? null : { key: this.key, source: 'environment' };
  }

  async describe(): Promise<{ configured: boolean; source: 'environment' | 'none' }> {
    return this.key === null
      ? { configured: false, source: 'none' }
      : { configured: true, source: 'environment' };
  }

  async setKey(key: string): Promise<SecretWriteResult> {
    this.key = key;
    return { source: 'environment' };
  }

  async removeKey(): Promise<SecretRemoveResult> {
    const existed = this.key !== null;
    this.key = null;
    return { removed: existed, environmentStillSet: false };
  }
}

export interface TestAppOptions {
  provider?: AiProvider;
  secrets?: SecretStore;
  now?: () => Date;
  idFactory?: () => string;
  cspNonce?: string;
}

export interface TestAppContext {
  app: ReturnType<typeof createApp>;
  libraryRoot: string;
  dataDir: string;
  service: LibraryService;
  sessionService: SessionService;
  events: SessionEventBus;
  coordinator: GenerationCoordinator;
  secrets: SecretStore;
  config: AppConfig;
  cleanup: () => Promise<void>;
}

export async function makeTestApp(
  overrides: Partial<AppConfig> = {},
  options: TestAppOptions = {},
): Promise<TestAppContext> {
  const libraryRoot = await createTempDirectory();
  const dataDir = await createTempDirectory('ccb-data-');
  const service = new LibraryService(makeRepository(libraryRoot));
  await service.initialize();
  const config = makeConfig({ libraryRoot, dataDir, ...overrides });
  const secrets = options.secrets ?? new MemorySecretStore();
  const events = new SessionEventBus();
  const coordinator = new GenerationCoordinator();
  const sessions = new SessionStore(
    new FsSessionRepository({ dataDir: config.dataDir, logger: makeSilentLogger() }),
  );
  const provider = options.provider ?? new FakeAiProvider();
  const runner = new GenerationRunner({
    sessions,
    library: service,
    provider,
    coordinator,
    events,
    logger: makeSilentLogger(),
    model: config.model,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const sessionService = new SessionService({
    sessions,
    library: service,
    secrets,
    events,
    coordinator,
    runner,
    logger: makeSilentLogger(),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.idFactory === undefined ? {} : { idFactory: options.idFactory }),
  });
  await sessionService.initialize();
  const app = createApp({
    config,
    logger: makeSilentLogger(),
    version: '0.1.0-test',
    libraryService: service,
    sessionService,
    events,
    secrets,
    ...(options.cspNonce === undefined ? {} : { cspNonce: options.cspNonce }),
  });

  return {
    app,
    libraryRoot,
    dataDir,
    service,
    sessionService,
    events,
    coordinator,
    secrets,
    config,
    cleanup: async () => {
      events.shutdown();
      await rm(libraryRoot, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
