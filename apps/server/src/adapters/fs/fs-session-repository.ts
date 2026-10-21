import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { SessionData } from '@ccb/contracts';
import { sessionDataSchema, sessionIdSchema } from '@ccb/contracts';
import type { Logger } from 'pino';

import { SessionError } from '../../domain/session-errors.js';
import type { SessionRepository } from '../../ports/session-repository.js';
import { removePath, writeJsonAtomic } from './atomic.js';
import { lstatIfExists, resolveInside } from './fs-paths.js';
import { readJsonMetadata } from './metadata.js';

export interface FsSessionRepositoryOptions {
  dataDir: string;
  logger: Logger;
}

const SESSIONS_DIRECTORY = 'sessions';

export class FsSessionRepository implements SessionRepository {
  private readonly sessionsDirectory: string;

  constructor(private readonly options: FsSessionRepositoryOptions) {
    this.sessionsDirectory = path.join(path.resolve(options.dataDir), SESSIONS_DIRECTORY);
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.sessionsDirectory, { recursive: true, mode: 0o700 });
      const stats = await lstatIfExists(this.sessionsDirectory);

      if (!stats.isDirectory || stats.isSymbolicLink) {
        throw new SessionError(
          'INTERNAL_ERROR',
          'The session data location is not a real directory.',
        );
      }
    } catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError(
        'INTERNAL_ERROR',
        'The session data directory could not be prepared. Check that it is writable.',
        { cause: error },
      );
    }
  }

  async get(id: string): Promise<SessionData | null> {
    const sessionId = sessionIdSchema.safeParse(id);

    if (!sessionId.success) {
      return null;
    }

    const filePath = this.filePath(sessionId.data);
    const result = await readJsonMetadata(filePath, sessionDataSchema);

    if (result.state === 'missing') {
      return null;
    }

    if (result.state === 'invalid') {
      throw new SessionError('INTERNAL_ERROR', 'This session file could not be read.', {
        details: { sessionId: sessionId.data },
      });
    }

    return result.value;
  }

  async list(): Promise<SessionData[]> {
    let entries;

    try {
      entries = await readdir(this.sessionsDirectory, { withFileTypes: true });
    } catch (error) {
      throw new SessionError('INTERNAL_ERROR', 'Sessions could not be listed.', { cause: error });
    }

    const sessions: SessionData[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) continue;

      const id = entry.name.slice(0, -'.json'.length);
      if (!sessionIdSchema.safeParse(id).success) continue;

      const result = await readJsonMetadata(this.filePath(id), sessionDataSchema);

      if (result.state === 'ok') {
        sessions.push(result.value);
      } else if (result.state === 'invalid') {
        this.options.logger.warn(
          { sessionId: id },
          'A session file could not be read and was skipped.',
        );
      }
    }

    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async save(session: SessionData): Promise<void> {
    await this.initialize();
    const validated = sessionDataSchema.parse(session);
    await writeJsonAtomic(this.filePath(validated.id), validated);
  }

  async delete(id: string): Promise<boolean> {
    const sessionId = sessionIdSchema.safeParse(id);

    if (!sessionId.success) {
      return false;
    }

    const stats = await lstatIfExists(this.filePath(sessionId.data));

    if (!stats.exists) {
      return false;
    }

    await removePath(this.filePath(sessionId.data));
    return true;
  }

  async pruneDrafts(now: Date, maxAgeDays: number): Promise<number> {
    const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
    const sessions = await this.list();
    let removed = 0;

    for (const session of sessions) {
      if (session.status !== 'draft') continue;
      const updated = Date.parse(session.updatedAt);

      if (Number.isFinite(updated) && updated < cutoff) {
        if (await this.delete(session.id)) removed += 1;
      }
    }

    return removed;
  }

  private filePath(id: string): string {
    return resolveInside(this.sessionsDirectory, `${id}.json`);
  }
}
