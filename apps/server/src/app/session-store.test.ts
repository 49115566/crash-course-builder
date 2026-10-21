import { describe, expect, it, vi } from 'vitest';

import type { SessionData } from '@ccb/contracts';
import type { SessionRepository } from '../ports/session-repository.js';
import { createSessionFixture } from '../test/session-fixtures.js';
import { SessionStore } from './session-store.js';

function makeRepository(): SessionRepository & { values: Map<string, SessionData> } {
  const values = new Map<string, SessionData>();
  return {
    values,
    initialize: vi.fn(async () => undefined),
    get: vi.fn(async (id: string) => values.get(id) ?? null),
    list: vi.fn(async () => [...values.values()]),
    save: vi.fn(async (session: SessionData) => {
      values.set(session.id, session);
    }),
    delete: vi.fn(async (id: string) => values.delete(id)),
    pruneDrafts: vi.fn(async () => 0),
  };
}

describe('SessionStore', () => {
  it('creates, reads, saves, updates, and deletes sessions', async () => {
    const repository = makeRepository();
    const store = new SessionStore(repository);
    const session = createSessionFixture();
    await store.initialize();
    await store.create(session);

    await expect(store.get(session.id)).resolves.toEqual(session);
    await expect(store.require(session.id)).resolves.toEqual(session);
    await expect(store.list()).resolves.toEqual([session]);

    const saved = await store.save({ ...session, status: 'outline_review' });
    expect(saved.status).toBe('outline_review');

    const updated = await store.update(session.id, (current) => ({
      ...current,
      status: 'completed',
    }));
    expect(updated.status).toBe('completed');
    await expect(store.delete(session.id)).resolves.toBe(true);
    await expect(store.get(session.id)).resolves.toBeNull();
  });

  it('reports missing sessions consistently', async () => {
    const store = new SessionStore(makeRepository());

    await expect(store.require('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(store.update('missing', (session) => session)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('delegates draft pruning', async () => {
    const repository = makeRepository();
    const store = new SessionStore(repository);
    const now = new Date('2026-01-10T00:00:00.000Z');

    await store.pruneDrafts(now, 7);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repository.pruneDrafts).toHaveBeenCalledWith(now, 7);
  });
});
