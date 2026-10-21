import type { SectionInput } from '../../ports/ai-provider.js';

export const FAKE_COURSE_TITLE = 'Vector Databases: A 30-Minute Crash Course';

const SECTIONS = [
  ['Foundations', ['Embeddings', 'Similarity metrics', 'When vector search fits']],
  ['Embeddings', ['Choosing a model', 'Normalization', 'Dimensionality']],
  ['Indexing', ['Exact search', 'HNSW', 'Inverted files']],
  ['Retrieval quality', ['Recall and precision', 'Hybrid search', 'Re-ranking']],
  ['Operations', ['Ingestion', 'Backups', 'Monitoring']],
  ['Cost and trade-offs', ['Memory', 'Latency', 'Build versus buy']],
  ['Putting it together', ['Reference architecture', 'Checklist', 'Next steps']],
] as const;

export const FAKE_OUTLINE_MARKDOWN = [
  `# ${FAKE_COURSE_TITLE}`,
  '',
  '**Promise:** Choose, build, and operate a vector search system with confidence.',
  '',
  '**Audience:** software engineers',
  '',
  '**Summary:** A practical tour of embeddings, indexing, retrieval quality, and the operational trade-offs that matter in production.',
  '',
  ...SECTIONS.flatMap(([title, bullets], index) => [
    `## ${String(index + 1)}. ${title}`,
    '',
    ...bullets.map((bullet) => `- ${bullet}`),
    '',
  ]),
].join('\n');

export function fakeSectionMarkdown(input: SectionInput): string {
  const title = input.sectionTitle;
  const number = input.sectionNumber;

  return [
    `## ${String(number)}. ${title}`,
    '',
    `This section teaches **${title}** from first principles. It starts with the smallest useful mental model, then adds the practical details you need to make a decision.`,
    '',
    '### A practical view',
    '',
    'A good working rule is to measure the behavior you care about instead of optimizing a proxy. Latency, recall, and cost move together, and the right balance depends on the product.',
    '',
    '| Concept | What it means |',
    '| --- | --- |',
    '| Recall | How many relevant results were found |',
    '| Latency | How long a query takes |',
    '| Cost | What it takes to serve and maintain |',
    '',
    'A useful relationship to remember is $a^2 + b^2 = c^2$.',
    '',
    `To apply ${title.toLowerCase()} safely, start small, write down the trade-off you are making, and verify it with a representative workload.`,
  ].join('\n');
}
