import { describe, expect, it } from 'vitest';

import { GenerationCoordinator } from './generation-coordinator.js';

describe('GenerationCoordinator', () => {
  it('allows one active run and exposes its session id', () => {
    const coordinator = new GenerationCoordinator();
    const first = coordinator.tryBegin('session-a');

    expect(first).not.toBeNull();
    expect(coordinator.getActiveSessionId()).toBe('session-a');
    expect(coordinator.tryBegin('session-b')).toBeNull();
    expect(first && coordinator.isCurrent('session-a', first.runId)).toBe(true);
    expect(first && coordinator.getSignal('session-a', first.runId)).toBe(
      first?.abortController.signal,
    );
    expect(first && coordinator.getSignal('session-b', first.runId)).toBeNull();
  });

  it('records pause requests and reports them only to the active run', () => {
    const coordinator = new GenerationCoordinator();
    const run = coordinator.tryBegin('session-a');
    if (run === null) throw new Error('Missing run.');

    expect(coordinator.shouldPause('session-a', run.runId)).toBe(false);
    expect(coordinator.requestPause('session-b')).toBe(false);
    expect(coordinator.requestPause('session-a')).toBe(true);
    expect(coordinator.shouldPause('session-a', run.runId)).toBe(true);
    expect(coordinator.shouldPause('session-a', 'other-run')).toBe(false);
  });

  it('aborts runs with stop, interrupted, and delete reasons', () => {
    const coordinator = new GenerationCoordinator();
    const run = coordinator.tryBegin('session-a');
    if (run === null) throw new Error('Missing run.');

    expect(coordinator.abort('session-b')).toBe(false);
    expect(coordinator.abort('session-a', 'stop')).toBe(true);
    expect(run.abortController.signal.aborted).toBe(true);
    expect(coordinator.getAbortReason('session-a', run.runId)).toBe('stop');
    expect(coordinator.isCurrent('session-a', run.runId)).toBe(false);
    expect(coordinator.getAbortReason('session-a', 'other')).toBeNull();

    coordinator.finish('session-a', 'other');
    expect(coordinator.getActiveSessionId()).toBe('session-a');
    coordinator.finish('session-a', run.runId);
    expect(coordinator.getActiveSessionId()).toBeNull();
  });

  it('supports delete cancellation and shutdown aborts', () => {
    const coordinator = new GenerationCoordinator();
    const run = coordinator.tryBegin('session-a');
    if (run === null) throw new Error('Missing run.');

    expect(coordinator.cancelForDelete('session-a')).toBe(true);
    expect(coordinator.getAbortReason('session-a', run.runId)).toBe('delete');
    coordinator.finish('session-a', run.runId);

    const second = coordinator.tryBegin('session-b');
    expect(second).not.toBeNull();
    expect(coordinator.abortAll()).toEqual(['session-b']);
    expect(coordinator.getAbortReason('session-b', second?.runId ?? '')).toBe('interrupted');
    coordinator.finish('session-b', second?.runId ?? '');
    expect(coordinator.abortAll()).toEqual([]);
  });
});
