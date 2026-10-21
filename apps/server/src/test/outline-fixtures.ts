export const VALID_OUTLINE_MARKDOWN = `# Vector Databases: A 30-Minute Crash Course

**Promise:** Choose, build, and operate a vector search system with confidence.

**Audience:** software engineers

**Summary:** This course explains embeddings, indexing, retrieval quality, and the operational trade-offs that matter in production.

## 1. Foundations

- What an embedding represents
- Similarity metrics such as $\\cos(\\theta)$
- When vector search is the right tool

## 2. Embeddings

- Turning text and images into vectors
- Choosing an embedding model
- Normalization and dimensionality

## 3. Indexing strategies

- Exact nearest-neighbor search
- HNSW and inverted-file indexes
- Memory and build-time trade-offs

## 4. Retrieval quality

- Recall and precision
- Hybrid search and filters
- Re-ranking results

## 5. Operations

- Ingestion and re-indexing
- Backups and recovery
- Monitoring latency and recall

## 6. Cost and trade-offs

- Memory cost of vectors
- Query latency versus recall
- Build versus buy

## 7. Putting it together

- A reference architecture
- A production checklist
- Next steps for practice
`;

export const FENCED_OUTLINE_MARKDOWN = `\`\`\`markdown
${VALID_OUTLINE_MARKDOWN}\`\`\`
`;

export const TOC_OUTLINE_MARKDOWN = `# Retrieval-Augmented Generation

**Promise:** Build a grounded question-answering system.

**Audience:** application developers

**Summary:** A practical introduction to retrieval-augmented generation.

## Table of Contents

- [Foundations](#foundations)
- [Retrieval](#retrieval)
- [Evaluation](#evaluation)

## 1. Foundations

- Why retrieval matters
- Core components

## 2. Retrieval

- Chunking
- Hybrid search

## 3. Evaluation

- Groundedness
- Latency
`;

export const FALLBACK_OUTLINE_MARKDOWN = `# Observability for Small Teams

**Promise:** Find production problems before your users do.

**Audience:** startup engineers

**Summary:** A compact guide to logs, metrics, and traces.

1. Signals
   - Logs, metrics, and traces
   - Choosing what to measure
2. Instrumentation
   - Structured logging
   - Tracing boundaries
3. Alerting
   - Symptom-based alerts
   - Runbooks
`;

export const H3_OUTLINE_MARKDOWN = `# Modern CSS Layout

**Promise:** Build resilient page layouts with modern CSS.

**Audience:** frontend developers

**Summary:** A tour of grid, flexbox, and container queries.

## 1. Grid fundamentals

### Defining tracks

### Placing items

## 2. Flexbox

### Main and cross axes

### Wrapping and alignment

## 3. Container queries

### Naming containers

### Responsive components
`;

export const UNICODE_OUTLINE_MARKDOWN = `# Café ☕ — Données vectorielles

**Promise:** Comprendre la recherche vectorielle.

**Audience:** ingénieurs logiciels

**Summary:** Un cours pratique sur les vecteurs et la recherche.

## 1. Fondations

- Représentations vectorielles
- Métriques de similarité

## 2. Indexation

- HNSW
- Fichiers inversés
`;

export const SIXTEEN_SECTIONS_MARKDOWN = `# Too Many Sections

## 1. One
- A
## 2. Two
- A
## 3. Three
- A
## 4. Four
- A
## 5. Five
- A
## 6. Six
- A
## 7. Seven
- A
## 8. Eight
- A
## 9. Nine
- A
## 10. Ten
- A
## 11. Eleven
- A
## 12. Twelve
- A
## 13. Thirteen
- A
## 14. Fourteen
- A
## 15. Fifteen
- A
## 16. Sixteen
- A
`;

export const DUPLICATE_TITLES_MARKDOWN = `# Duplicate Sections

## 1. Foundations

- One

## 2. foundations

- Two
`;

export const ADVERSARIAL_OUTLINE_MARKDOWN = `# Security and Trust

**Promise:** Treat model output as untrusted input.

**Audience:** platform engineers

**Summary:** Practical defenses for generated content.

<script>alert("cover")</script>

## 1. Input handling

- <script>alert("bullet")</script>
- ![remote chart](https://example.test/chart.png)
- Validate [links](https://example.test/page) before rendering

## 2. Rendering

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

- Disable raw HTML
- Sanitize Markdown

## 3. Operations

- Log safely
- Test adversarial inputs
`;

export const MALFORMED_OUTLINE_MARKDOWN = `This is not an outline.

It is a paragraph with no headings or numbered sections.
`;
