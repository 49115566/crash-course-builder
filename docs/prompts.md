# Prompt contract v1

Milestone 6 does not change prompt wording, delimiters, or version. The existing snapshot tests remain
the source of truth and continue to pin the exact starting and continuation prompts.

The source of truth for prompt text is
`apps/server/src/domain/prompt-builder.ts`. Snapshot tests pin its exact output. This document
describes the rules the builder implements and the policy for changing them.

## Versioning

- `PROMPT_VERSION` is currently `1`.
- Every completed course records this value as `meta.json.promptVersion`.
- Session snapshots (Milestone 3) store the exact `system` and `user` strings used. Resuming a
  session after an app update must not silently change prompts mid-course.
- Any change to prompt wording, delimiters, or rules must bump `PROMPT_VERSION`, refresh the
  snapshots, and be reviewed as a product change.

## Starting prompt

The starting prompt asks for a course outline, not course prose.

The system message defines:

- The role: an expert curriculum designer and technical writer.
- Output format: one H1 title, a labelled cover block, and 6–9 numbered H2 sections.
- The cover block labels: `**Promise:**`, `**Audience:**`, and `**Summary:**`.
- Exactly `## n. Section title` headings with 2–5 bullets each.
- No separate table of contents, link list, Mermaid, diagrams, images, raw HTML, or footnotes.
- LaTeX conventions: `$...$` inline and `$$...$$` display; no `\(...\)` or `\[...\]`.
- Current best practices, no invented statistics or citations, and brief caution for high-stakes
  medical, legal, financial, or safety-critical topics.

The user message contains the subject, topic, audience, and optional additional instructions in a
delimited `<course_request>` block. When prior courses exist in the same subject, the prompt also
contains a `<prior_courses>` block followed by these exact instructions:

> Assume the user has already taken these courses, and build on them.
>
> Do not re-teach material those courses already covered at the same level; use only brief bridging
> references.

Prior-course rules:

- Only `topic` and `audience` are serialized. Outlines, titles, stats, and IDs are never included.
- At most 50 entries are included; the caller supplies them most-recent-first.
- Newlines and control characters in prior values are collapsed to spaces.
- The prior block and the build-on/anti-repetition instructions are omitted when there are no prior
  courses.

## Continuation prompts

Each approved outline section gets its own continuation prompt. The shared course brief contains:

- Course title.
- Audience.
- Promise, when available.
- The user's additional instructions, verbatim, in the same delimited block every time.
- The complete list of section titles (titles only).

The section block contains the section number, title, bullets, and word budget. The user message
also instructs the model to write the full section now.

Word budget:

```text
clamp(round(4500 / sectionCount), 350, 900)
```

Examples: 6 sections → 750 words, 7 → 643, 9 → 500, 15 → 350.

The section system message requires:

- Exactly one H2 heading in the form `## n. Title`; no H1 and no other H2s.
- Teaching from zero, without assuming other sections were read.
- No repetition or summary of other sections.
- No TOC, Mermaid, images, raw HTML, or footnotes.
- LaTeX and safety/factual rules consistent with the starting prompt.

Additional instructions are included verbatim in every continuation prompt via the shared brief, so
guidance such as "use e-commerce examples" applies to section prose and not only to the outline.

## Token estimates

`estimatedTokens` is an estimate of `ceil(code points / 4)` per prompt, summed across the system and
user messages. It is intended for prompt-preview display, not billing or hard limits.

## Outline parsing

The parser uses `marked`'s Markdown lexer, not regex-only parsing. It tolerates common model
deviations while enforcing the contract:

- A response wrapped in one outer code fence is unwrapped and re-lexed.
- The first H1 becomes the title; missing titles fall back to the user's topic.
- Cover labels are extracted from the area before the first section.
- H2 headings become sections. A heading named "Table of Contents", "Contents", "Course Outline", or
  "Outline" and its link list are ignored.
- Numbering styles such as `1.`, `01)`, `Section 1:`, or `3 —` are normalized and sections are
  renumbered sequentially.
- List items become bullets. If a section has no list items, H3 headings are used as fallback
  bullets. Empty and duplicate bullets are dropped.
- If no H2 headings exist, a top-level ordered list is used as the outline.
- The parser accepts 2–15 sections. It rejects unparseable output, empty section titles, duplicate
  titles after Unicode/case normalization, and oversized responses.
- Rejections throw `OutlineError` (`OUTLINE_INVALID`) with actionable messages and structured issue
  codes. The HTTP layer maps these to `422`.
- Raw model output is preserved by the session layer (Milestone 3) for diagnostics.

## Course assembly

`assembleCourse` receives the parsed outline, one generated Markdown draft per section, and fixed
course identity/timestamps. It:

- Requires exactly one draft per section, with unique matching numbers.
- Removes outer fences, generated TOC blocks, Mermaid fences, images, and dangerous block HTML.
- Removes H1 headings and the model's own section heading, then writes one canonical
  `## n. Title` per outline section.
- Demotes any extra H2 headings to H3 so the reader sees exactly one H2 per section.
- Rejects empty sections; section generation must be retried by the runner instead.
- Renders the course cover once, without embedding the outline.
- Renders a standalone `outline.md` with the cover and a numbered outline.
- Computes `stats.sections`, `stats.words`, and `stats.readingMinutes` (200 words/minute), then
  validates the result with `courseMetadataSchema`.

## Fake provider

`apps/server/src/adapters/fake-ai` provides a deterministic AI provider for tests and future e2e
runs. It supports configurable chunk size and delay, abort signals, section-specific failures,
partial-stream failures, and deterministic token usage. It never contacts the network.

## Tests

- Prompt snapshots: starting prompt with/without instructions and prior courses; continuation
  prompts with/without instructions.
- Exact prior-context rules, build-on/anti-repetition text, instruction repetition, delimiters, and
  word budgets.
- Parser fixtures: valid, fenced, TOC, numbered-list fallback, H3 fallback, Unicode, LaTeX,
  duplicate titles, too few/too many sections, oversized input, and adversarial HTML/images/Mermaid.
- Assembler and renderer snapshots, metadata schema validation, and a full pipeline test that writes
  and rescans a real course folder.
