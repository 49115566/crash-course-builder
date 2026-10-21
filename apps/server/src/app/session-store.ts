import type { SessionData } from '@ccb/contracts';

import { SessionError } from '../domain/session-errors.js';
import type { SessionRepository } from '../ports/session-repository.js';
import { AsyncLock } from './async-lock.js';

export class SessionStore {
  private readonly lock = new AsyncLock();

  constructor(private readonly repository: SessionRepository) {}

  async initialize(): Promise<void> {
    await this.repository.initialize();
  }

  async get(id: string): Promise<SessionData | null> {
    return this.repository.get(id);
  }

  async require(id: string): Promise<SessionData> {
    const session = await this.repository.get(id);

    if (session === null) {
      throw new SessionError('NOT_FOUND', 'The session could not be found.', {
        details: { sessionId: id },
      });
    }

    return session;
  }

  async list(): Promise<SessionData[]> {
    return this.repository.list();
  }

  async create(session: SessionData): Promise<SessionData> {
    return this.lock.run(async () => {
      await this.repository.save(session);
      return session;
    });
  }

  async save(session: SessionData): Promise<SessionData> {
    return this.lock.run(async () => {
      await this.repository.save(session);
      return session;
    });
  }

  async update(
    id: string,
    updater: (session: SessionData) => SessionData | Promise<SessionData>,
  ): Promise<SessionData> {
    return this.lock.run(async () => {
      const session = await this.repository.get(id);

      if (session === null) {
        throw new SessionError('NOT_FOUND', 'The session could not be found.', {
          details: { sessionId: id },
        });
      }

      const next = await updater(session);
      await this.repository.save(next);
      return next;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.lock.run(() => this.repository.delete(id));
  }

  async pruneDrafts(now: Date, maxAgeDays: number): Promise<number> {
    return this.lock.run(() => this.repository.pruneDrafts(now, maxAgeDays));
  }
}
