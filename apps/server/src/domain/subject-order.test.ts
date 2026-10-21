import { describe, expect, it } from 'vitest';

import { mergeSubjectOrder } from './subject-order.js';

function subject(id: string, name: string) {
  return {
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    courses: [],
  };
}

describe('mergeSubjectOrder', () => {
  it('preserves the requested order and appends unknown subjects by name', () => {
    const a = subject('123e4567-e89b-42d3-a456-42661417400a', 'Zebra');
    const b = subject('123e4567-e89b-42d3-a456-42661417400b', 'Art');
    const c = subject('123e4567-e89b-42d3-a456-42661417400c', 'Math');

    const result = mergeSubjectOrder([a.id], [a, b, c]);

    expect(result.subjectIds).toEqual([a.id, b.id, c.id]);
  });

  it('ignores stale ids and duplicate order entries', () => {
    const a = subject('123e4567-e89b-42d3-a456-42661417400a', 'A');
    const b = subject('123e4567-e89b-42d3-a456-42661417400b', 'B');

    const result = mergeSubjectOrder(['unused', a.id, a.id], [a, b]);

    expect(result.subjectIds).toEqual([a.id, b.id]);
  });
});
