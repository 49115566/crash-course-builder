import type { SubjectSummary } from '@ccb/contracts';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function mergeSubjectOrder(
  orderedIds: readonly string[],
  subjects: readonly SubjectSummary[],
): { subjects: SubjectSummary[]; subjectIds: string[] } {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const seen = new Set<string>();
  const ordered: SubjectSummary[] = [];

  for (const id of orderedIds) {
    const subject = byId.get(id);
    if (subject !== undefined && !seen.has(id)) {
      seen.add(id);
      ordered.push(subject);
    }
  }

  const remaining = subjects
    .filter((subject) => !seen.has(subject.id))
    .sort((left, right) => collator.compare(left.name, right.name));

  ordered.push(...remaining);

  return {
    subjects: ordered,
    subjectIds: ordered.map((subject) => subject.id),
  };
}
