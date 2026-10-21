# ADR 0005: Reader rendering, table of contents, and ephemeral progress

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The reader must render AI-generated Markdown safely, including GFM tables and KaTeX formulas, while
remaining fully local and compatible with the future strict CSP. Course files can also be edited by
hand outside the app, so the reader cannot assume the stored Markdown is well formed.

The reader needs a usable table of contents even though prompt v1 deliberately forbids the model
from emitting one (see ADR 0001). Reading progress is useful for orientation but is not product
progress tracking and must not be persisted.

## Decision

- Render with `ngx-markdown` and `marked`, configured with a custom renderer that removes raw HTML
  and image tokens.
- Supply a custom DOMPurify sanitizer through ngx-markdown's `SANITIZE` token. It uses a strict tag
  and attribute allowlist, rejects unsafe URI schemes, and strips media, style, and event
  attributes.
- Run KaTeX **after** sanitization on the sanitized DOM. KaTeX uses `trust: false`, bounded macro
  expansion, and skips code blocks. This avoids granting DOMPurify a broad MathML/style allowlist
  for model output.
- Keep all Markdown and KaTeX JavaScript behind the lazy `/courses/:id` route.
- Derive the “In this course” card, sidebar, and heading anchors from the canonical H2 headings in
  `course.md`. `outline.md` remains a separate human-readable file and is not rendered as a second,
  competing outline.
- Show a mobile contents drawer with CDK Dialog focus trapping. A sticky sidebar is used on wide
  screens.
- Compute scrollspy and the progress line in memory only. Never write progress to storage and never
  send it to the server.
- Keep the reader read-only. Printing and copying the course link are available; move and delete
  remain in the library.

## Consequences

- Malicious or malformed Markdown cannot create script, image, iframe, or unsafe-link execution.
- KaTeX output is trusted only to the extent of the KaTeX renderer with `trust: false`; its inline
  style attributes are a documented residual risk for the CSP milestone.
- The table of contents always matches the actual section headings, including hand-edited files.
- Reading progress resets on reload by design and cannot be mistaken for completion tracking.
- The reader route adds a sizeable lazy chunk, but the initial application bundle is unchanged.
