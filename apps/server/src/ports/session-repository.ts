import type { SessionData } from '@ccb/contracts';

export interface SessionRepository {
  initialize(): Promise<void>;
  get(id: string): Promise<SessionData | null>;
  list(): Promise<SessionData[]>;
  save(session: SessionData): Promise<void>;
  delete(id: string): Promise<boolean>;
  pruneDrafts(now: Date, maxAgeDays: number): Promise<number>;
}
