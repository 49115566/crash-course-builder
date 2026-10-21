# Phase 1 Implementation Plan — AI Crash Course Builder (Angular)

## 1. Locked decisions

- **Frontend:** Angular 22.2.x, standalone components, signals, zoneless change detection, strict TypeScript, SCSS.
- **Backend:** Node 24.15+ with Express 5. Angular is the UI; a small local Node service owns filesystem access, secrets, AI calls, and streaming.
- **Architecture:** npm workspaces with a shared contracts package. Clean ports/adapters boundaries on the server.
- **Progress UX:** SSE token streaming per section, durable checkpoints, pause/stop, manual resume, no automatic AI retries.
- **Subject organization:** top-level subjects can be reordered; courses can be moved between subjects. Phase 1 interprets “move a subject matter” as **reorder only** in the flat subject model — there is no nesting or arbitrary relocation. Supporting nested categories would be a scope change.
- **Deployment:** one local Node process serving the built Angular app at `127.0.0.1`, with a key-management CLI and doctor command.
- **Out of scope:** Phase 2 conversations, Mermaid, settings UI, multiple providers, cloud hosting, desktop packaging.

Current registry versions to pin via lockfile: Angular/CDK **22.2.3**, Angular CLI **22.2.3**, Vitest **5.x**, Playwright **1.64.x**, Express **5.3.x**, Zod **4.x**, ngx-markdown **22.1.x**, KaTeX **0.18.x** (ngx-markdown requires `<0.19`).

---

## 2. Repository architecture

```text
crash-course-builder/
├── package.json                  # workspaces + orchestration scripts
├── package-lock.json
├── tsconfig.base.json
├── eslint.config.js
├── apps/
│   ├── web/                      # Angular application
│   └── server/                   # Node/Express local service
├── packages/
│   └── contracts/                # Zod schemas, DTOs, enums, error codes
├── e2e/                          # Playwright specs + fixtures
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── prompts.md
│   └── adr/                      # short architecture decision records
└── README.md
```

Build order: `contracts → web → server`. The server serves `apps/web/dist/web/browser`. In development, `ng serve` proxies `/api` to the Node process.

### Server layering

```text
apps/server/src/
├── main.ts                       # composition root, port, graceful shutdown
├── config.ts                     # env/config validation
├── logger.ts                     # pino, redaction
├── http/
│   ├── app.ts                    # Express wiring, static files, security
│   ├── errors.ts                 # error envelope + status mapping
│   ├── security.ts               # host/origin/CSRF checks, headers
│   └── routes/
│       ├── system.routes.ts
│       ├── library.routes.ts
│       ├── course.routes.ts
│       ├── session.routes.ts
│       └── events.routes.ts      # SSE
├── domain/                       # pure, no I/O
│   ├── course.ts
│   ├── outline.ts
│   ├── outline-parser.ts
│   ├── prompt-builder.ts
│   ├── course-assembler.ts
│   ├── session-state.ts
│   └── word-count.ts
├── app/                          # use cases / orchestration
│   ├── library-service.ts
│   ├── course-service.ts
│   ├── session-service.ts
│   ├── generation-runner.ts
│   └── event-bus.ts
├── ports/
│   ├── ai-provider.ts
│   ├── library-repository.ts
│   ├── session-repository.ts
│   └── secret-store.ts
└── adapters/
    ├── deepseek/                 # streaming client + SSE parser
    ├── fs/                       # library/session repositories
    ├── secrets/                  # keychain + config fallback
    └── fake-ai/                  # deterministic test provider
```

Domain code has no Express, filesystem, or network imports. Repositories are injectable through a small manual composition root.

### Angular structure

```text
apps/web/src/app/
├── app.ts / app.routes.ts / app.config.ts
├── core/
│   ├── api/                      # typed clients, interceptors, error mapping
│   ├── realtime/                 # EventSource service, reconnect, signals
│   └── models/                   # re-exports from @ccb/contracts
├── shared/
│   ├── ui/                       # button, dialog, menu, toast, badges...
│   ├── markdown/                 # sanitized Markdown + KaTeX renderer
│   └── layout/                   # app shell, breadcrumbs, key banner
├── features/
│   ├── library/
│   ├── wizard/
│   └── reader/
└── styles/                       # tokens, typography, base, print
```

Use route-level lazy loading, `OnPush`, signal stores per feature, typed reactive forms, and Angular CDK for dialogs, menus, overlays, drag-drop, and focus management. No NgRx and no Angular Material theme dependency.

---

## 3. Filesystem and persistence design

### Default locations

| Purpose | Default | Override |
|---|---|---|
| Course library | `~/CrashCourses` | `CCB_LIBRARY_ROOT` |
| App data/sessions | OS data dir via `env-paths` | `CCB_DATA_DIR` |
| Config fallback | OS config dir via `env-paths` | `CCB_CONFIG_DIR` |
| Port | `4310` | `CCB_PORT` |
| Model | `deepseek-chat` | `CCB_MODEL` |
| API base URL | `https://api.deepseek.com` | `CCB_DEEPSEEK_BASE_URL` |

### Library layout

```text
<library root>/
├── .crash-course-builder/
│   ├── library.json              # subject order only: {schemaVersion, subjectIds[]}
│   └── staging/<courseId>/       # hidden finalization area
├── Computer Science/
│   ├── .subject.json             # {schemaVersion, id, name, createdAt, updatedAt}
│   └── Vector Databases/
│       ├── course.md
│       ├── outline.md
│       └── meta.json
└── Marketing/
```

- Subject and course IDs are **stable UUIDs**, not folder names. Folders may be renamed without breaking links.
- Folder names are readable but sanitized: NFKC normalization, illegal/reserved characters removed, max length, Windows reserved names rejected, collision suffix ` (2)`.
- Hidden directories are excluded from the library index.
- Directories use restrictive permissions (`0700`), files `0600`.
- All JSON writes are atomic: temp file in same directory → fsync → rename.
- Courses are assembled in hidden staging and atomically renamed into the subject folder only after every section succeeds. The library never shows half-written courses.
- If finalization fails, the session remains resumable and finalization is retried without regenerating sections.

### Scan and reconciliation policy

The real folder tree is authoritative for **existence and location**; hidden metadata never appears in the UI.

- A subject’s folder name is authoritative for its display name. `.subject.json` holds the stable subject ID.
- If a subject folder is manually renamed, the scan keeps the ID, treats the folder name as the new name, repairs `.subject.json.name`, and repairs denormalized `meta.subject.name` in every course under it. Repairs are atomic per file; failures become warnings and are retried on the next scan.
- The subject rename API updates `.subject.json`, renames the folder, and updates affected course `meta.json` files. The scan repairs any interrupted multi-file update.
- If a course folder is manually moved between subjects, the folder location wins; the scan repairs `meta.subject.id`/`meta.subject.name` to match the containing subject.
- Manually added subject folders without `.subject.json` are adopted with a new UUID and a generated metadata file.
- Manually added course folders without valid `meta.json` are not silently adopted or deleted; they are reported as scan warnings.
- Nested directories inside a subject are not treated as subjects and are reported as warnings.
- Duplicate course IDs or corrupt metadata are surfaced as warnings; the first valid course wins and no data is overwritten.
- Tests cover manual rename, manual move, manual addition, corrupt metadata, interrupted rename repair, and the “folder name wins” rule.

### Session storage

`<data dir>/sessions/<sessionId>.json` contains the complete workflow state: inputs, prior-course snapshot, generated prompts, raw outline, parsed outline, per-section status/content/errors, token usage, timestamps, and the reserved `courseId`.

This makes refresh, navigation away, server restart, and manual resume safe.

### Session state machine

```text
draft
  → generating_outline
  → outline_review
  → expanding
  → completed

Failure/interruption at any active stage:
  → failed     (AI/parse/storage error)
  → paused     (user paused/stopped or app restarted)
```

Rules:

- `failed` means **paused with an error**: no worker is active, completed sections are preserved, and only an explicit resume can continue. It is never auto-retried. The UI labels it “Paused — needs attention” rather than implying a dead end.
- Only explicit API actions advance approval gates.
- Expansion cannot start from any state except `outline_review`.
- Resume is always manual.
- On server startup, any `generating_outline` or `expanding` session becomes `paused` with reason `interrupted`; partial token output is discarded, completed sections are preserved.
- `PATCH /api/sessions/:id/inputs` is accepted only in `draft` or `outline_review`. From `outline_review`, it **resets the session to `draft`**, invalidates the raw outline, parsed outline, continuation prompts, and all section state, and requires a new outline before approval. Input edits in any active or completed state return `409 INVALID_STATE`.
- `regenerate-outline` is accepted only in `outline_review` (before expansion) or in `failed` with stage `outline`. It replaces the outline and continuation prompts and returns to review. Once expansion has started, regeneration returns `409 EXPANSION_STARTED`; completed sections are never silently discarded. Discarding requires an explicit session deletion and a new course.
- Drafts are URL-resumable and also appear in the library in-progress strip with “Continue setup” and “Discard” actions. They are cleaned after 7 days if untouched.
- Completed session snapshots are pruned later, while the course files remain permanent.

### `meta.json`

```json
{
  "schemaVersion": 1,
  "id": "uuid",
  "subject": { "id": "uuid", "name": "Computer Science" },
  "topic": "Vector Databases",
  "title": "Vector Databases: A 30-Minute Crash Course",
  "audience": "software engineers",
  "instructions": "Use practical examples",
  "createdAt": "…",
  "updatedAt": "…",
  "status": "complete",
  "ai": { "provider": "deepseek", "model": "deepseek-chat" },
  "promptVersion": "1",
  "stats": { "sections": 7, "words": 4820, "readingMinutes": 22 }
}
```

`course.md` contains the title, audience/promise cover, and expanded sections. `outline.md` is a human-readable cover + numbered outline. The outline is **never embedded into `course.md`**.

---

## 4. API surface

All successful JSON responses use the shared contracts type:

```ts
type ApiSuccess<T> = {
  data: T;
  warnings?: ScanWarning[];
  requestId: string;
};
```

List endpoints put non-fatal scan/reconciliation warnings in `warnings`. Errors use:

```json
{ "error": { "code": "AI_TIMEOUT", "message": "…", "retryable": true, "details": {} } }
```

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/bootstrap` | App version, library root, key configured/source, model; no secrets |
| GET | `/api/health` | Process/library/key readiness |
| GET | `/api/library` | Ordered subjects + courses + scan warnings |
| POST | `/api/subjects` | Create subject |
| PATCH | `/api/subjects/:id` | Rename subject |
| PUT | `/api/subjects/order` | Persist reordered subject IDs |
| DELETE | `/api/subjects/:id` | Delete empty subject or explicit cascade |
| POST | `/api/courses/:id/move` | Move course to another subject |
| DELETE | `/api/courses/:id` | Delete course with confirmation |
| GET | `/api/courses/:id` | `{meta, outlineMarkdown, courseMarkdown}` |
| POST | `/api/sessions` | Create draft from inputs; returns exact starting prompt preview |
| PATCH | `/api/sessions/:id/inputs` | Edit draft inputs; rebuild preview; from `outline_review`, resets to `draft` and invalidates outline/prompts |
| GET | `/api/sessions/:id` | Full resumable snapshot |
| GET | `/api/sessions?active=true` | In-progress strip, including drafts |
| POST | `/api/sessions/:id/outline` | Approval gate 1 → start outline generation |
| POST | `/api/sessions/:id/regenerate-outline` | Manual regeneration only in `outline_review` or failed outline stage; `409` after expansion begins |
| POST | `/api/sessions/:id/approve` | Approval gate 2 → start expansion |
| POST | `/api/sessions/:id/pause` | Finish current section, then pause |
| POST | `/api/sessions/:id/stop` | Abort current call, discard partial, pause |
| POST | `/api/sessions/:id/resume` | Resume failed/paused/interrupted session |
| DELETE | `/api/sessions/:id` | Stop and discard draft/session |
| GET | `/api/sessions/:id/events` | SSE: snapshot, status, outline deltas, section events, completion |

SSE details:

- POST endpoints return `202`; the client then opens the event stream.
- Events: `snapshot`, `status`, `outline_delta`, `outline_ready`, `section_started`, `section_delta`, `section_completed`, `section_failed`, `completed`.
- Token events are coalesced server-side to roughly 50 ms batches.
- Heartbeat every 15 seconds; disable compression and caching for the stream.
- On reconnect, the server sends an authoritative snapshot. Transport reconnect is allowed; AI calls are never auto-retried.
- Multiple tabs may watch the same session. The generation runner uses **one global single-active-generation lock per process**, not a per-session lock: only one AI workflow runs at a time. A second start returns `409 GENERATION_BUSY` with `details.activeSessionId`; the UI leaves the second course in `draft`, shows “Another course is being generated,” and links to the active session. There is no automatic queue. A per-session mutex additionally prevents duplicate starts of the same session.

Validation limits: subject 1–80 chars, topic 1–120, audience 1–160, instructions ≤ 4000. Names are checked for path traversal, reserved names, and filesystem collisions.

---

## 5. AI workflow and prompt design

### Provider port

```ts
interface AiProvider {
  streamOutline(input: OutlineInput, signal: AbortSignal): AsyncIterable<AiChunk>;
  streamSection(input: SectionInput, signal: AbortSignal): AsyncIterable<AiChunk>;
}
```

`AiChunk` carries text plus optional usage/finish metadata. The DeepSeek adapter uses native `fetch`, parses OpenAI-compatible SSE, and maps errors:

- `401` invalid key, `402` insufficient balance, `429` rate limit, `5xx` upstream, timeout, aborted, network failure.
- Timeouts: first byte 45 s, idle 60 s, absolute per-call limit 10 minutes.
- No internal retry loop. Errors persist to the session and stop the runner.

### Prompt contract (`v1`)

The starting system prompt defines the role, formatting rules, and safety/format constraints. The user prompt contains:

- Subject, topic, audience, optional instructions in delimited blocks.
- Prior courses in that subject: **topic + audience only**, capped at 50 entries, never outlines. Include the explicit instruction: *“Assume the user has already taken these courses, and build on them.”* Add an anti-repetition rule: do not re-teach material those courses already covered at the same level; use only brief bridging references.
- 30-minute target, current best practices, readable structure.
- Cover-page contract: title, one-line promise, audience, short summary.
- Numbered `##` section headings with 2–5 bullets each; these headings serve as the outline and are rendered into a table of contents by the UI. Explicitly forbid a separate TOC.
- Explicitly forbid Mermaid and raw HTML.
- LaTeX rules for formulas.

Target 6–9 sections. Parser accepts 2–15 and rejects anything outside with an actionable `OUTLINE_INVALID` error.

Continuation prompts are generated deterministically from the parsed outline and shown before approval. Each includes:

- A shared course brief: course title, audience, promise, the user’s additional instructions in the same delimited block, and the full section-title list (titles only).
- The user’s additional instructions are repeated verbatim in **every** continuation prompt (via the shared brief), so guidance such as “use e-commerce examples” applies to section prose, not only the outline.
- Current section number/title/bullets.
- Target word budget: `clamp(round(4500 / sectionCount), 350, 900)`.
- Teach from zero, no assumption of prior knowledge.
- `## n. Title` heading, no H1, no Mermaid, no images, LaTeX for math.
- Do not repeat or summarize other sections.

The prompt builder is snapshot-tested, including continuation prompts with and without additional instructions. Session snapshots store the exact prompts used, so resuming after an app update does not silently change mid-course behavior.

**Deliberate Phase 1 interpretation — cover and TOC:** the product asks for a book-like cover page and table of contents. Phase 1 asks the model for a cover plus numbered H2 section headings and forbids a separate TOC inside the AI output. This avoids duplicated/conflicting section lists and makes parsing deterministic. `outline.md` still contains a human-readable cover and numbered outline, and the reader’s “In this course” card supplies the interactive TOC. This deviation is recorded in the ADRs and tested in the reader.

### Outline parsing

Use the Markdown lexer (not regex-only) with tolerant recovery:

- Strip an outer Markdown code fence if the model wraps the entire answer.
- First H1 becomes the title; fallback to the user’s topic.
- H2 headings become sections; ignore a heading explicitly named “Table of Contents”/“Course Outline” and its link list.
- H3 content and list items become section bullets.
- Fall back to a numbered list if no H2 headings exist.
- Normalize numbering, whitespace, and Unicode.
- Reject empty bullets, duplicate section titles, too few/many sections.
- Preserve raw output in the session for diagnostics.

Course assembly strips Mermaid fences, remote images, and duplicate top-level headings, then writes the canonical H1 + cover + sections. The outline renderer produces the standalone `outline.md`.

### Generation runner

- Persist each section immediately after it completes.
- Check pause requests after each section; `stop` aborts immediately.
- On failure: persist the completed work, mark `failed`, emit a clear error, and halt.
- Resume restarts only the failed/incomplete section, or finalizes the course if all sections are already complete.
- Store token usage per call for diagnostics, never prompt content in logs.
- Finalize by writing all three files to staging, fsyncing, then atomically renaming the folder.

---

## 6. UI and UX design

### Visual direction

A quiet editorial study desk rather than a generic dashboard:

- Warm paper canvas, white surfaces, ink text, deep teal accent, amber warnings, restrained shadows and hairlines.
- **Source Serif 4** for course titles and reading content, **Inter** for UI, system monospace for prompt previews. Self-host via `@fontsource` so no external font service is contacted.
- 8-point spacing scale, 10–14 px radii, 160–220 ms motion, full `prefers-reduced-motion` support.
- Generous whitespace, strong typographic hierarchy, and calm status colors.
- Responsive from mobile reading width through desktop library width.

### Screens

**Library**

- Slim app shell, “Your library” heading, a simple optional search filter, and primary “New course” action.
- In-progress strip for **drafts, outline reviews, running/expanding, paused, and failed** sessions. “Continue setup”/“Resume” routes by stage; “Discard” deletes the session after confirmation. Drafts are therefore visible and not only URL-resumable.
- Subject sections with count, drag handle, and accessible move up/down actions. “Move subject” means reorder only; there is no nesting.
- Course cards show title, audience, reading time, updated date, and actions (Open, Move, Delete).
- Inline subject creation, move dialog with “create new subject” option, destructive confirmations.
- Search is a simple client-side filter over the already-loaded title/topic/audience fields. It is not Phase 4 search/discovery, is not an acceptance criterion, and should be deferred first if schedule pressure appears.
- Onboarding empty state, skeletons, and retryable scan errors.

**Creation wizard**

Routes preserve refresh/back behavior and session resumption:

```text
/courses/new
/courses/new/:sessionId/prompts
/courses/new/:sessionId/outline
/courses/new/:sessionId/write
```

1. **Details:** subject combobox with inline create, topic, audience, optional instructions. Validation and helper copy. A visible **Cancel/Discard** action deletes the draft session after confirmation and returns to the library.
2. **Starting prompt:** review the system and user messages exactly as they will be sent, prior-course context as visible chips, token estimate, and an explicit “no AI call has happened yet” note. Edit inputs or generate.
3. **Outline review:** human-friendly cover + outline on the left; expandable continuation prompts on the right. Show section count, estimated reading time, and AI call count. “Edit inputs” resets the session to draft and discards the outline/prompts. Regenerate is available only before expansion begins; after expansion starts it is disabled with a “Resume or discard this session” explanation. Approve is the only path to expansion.
4. **Generation:** overall progress, section list with states, live streamed text for the current section, word count, pause and stop controls. A failure is presented as **“Paused — needs attention”** with the specific error and a manual Resume action; there is no auto-retry. If another session holds the global generation lock, show `GENERATION_BUSY` with a link to the active session and leave this course in draft. Completed sections remain visible. On success, show the saved path and “Read course” / “Back to library”.
5. Leaving during generation is allowed; generation continues server-side and the library in-progress strip offers resume.

**Reader**

- Subject breadcrumb, metadata, reading-time estimate, and overflow actions.
- “In this course” outline card at the top, satisfying the requirement that the outline appears at the beginning.
- Optional sticky desktop contents sidebar, collapsing to a mobile drawer; scrollspy and an **ephemeral in-page scroll indicator only**. Reading progress is never persisted and is not completion tracking or reader progress tracking (explicitly deferred to Phase 4).
- Markdown headings, bold, lists, GFM tables, blockquotes, code, and KaTeX. No Mermaid rendering.
- Reader typography at ~68ch, responsive tables/code blocks, heading anchors, back-to-top, print styles.
- The “In this course” card is the Phase 1 table of contents; it links to the numbered course sections.
- Read-only; no follow-up UI. Document the future `conversations/` extension point in the architecture docs.

### Accessibility

Target WCAG 2.2 AA:

- Semantic landmarks, skip link, focus restoration, visible focus rings.
- CDK focus-trapped dialogs with Escape handling.
- Keyboard alternative for subject drag-reordering.
- `aria-live` announcements at section boundaries and completion, not for every token.
- Form labels, descriptions, and errors programmatically associated.
- Status conveyed by text/icon as well as color; contrast checked; 200% zoom tested.
- Axe checks in Playwright and a keyboard-only e2e test.

---

## 7. Security and privacy

- Server binds **127.0.0.1 only**, never `0.0.0.0`.
- Strict Host/Origin validation for local origins; reject cross-origin and non-local hosts.
- Require a custom request header on all mutating requests; no CORS middleware. This blocks cross-site requests and preflighted browser attacks.
- Security headers: CSP with a per-process nonce, `X-Content-Type-Options`, `X-Frame-Options: DENY`/frame-ancestors, no-referrer, same-origin resource policy.
- CSP/Angular strategy: inject a random nonce into `index.html` and Angular’s `ngCspNonce` root attribute so Angular-emitted style tags are allowed. Use `script-src 'self'` with no inline scripts and no `unsafe-eval`; `style-src 'self' 'nonce-<value>'`; `style-src-attr 'unsafe-inline'` only for KaTeX’s generated inline style attributes (documented residual risk, with sanitized/limited KaTeX output); `font-src 'self'` for self-hosted KaTeX fonts; `connect-src 'self'`; `img-src 'self' data:` (remote images are stripped). Test CSP headers and watch the browser console during e2e.
- Sanitize all Markdown with DOMPurify; disable raw HTML and images; reject `javascript:` links; add safe `rel` attributes.
- KaTeX runs with `trust: false` and expansion limits.
- Path safety: reject traversal, separators, reserved names, symlinks, and ensure resolved paths remain inside the library root.
- Secret handling: env > OS keychain > config file fallback. Keychain uses `@napi-rs/keyring`; fallback file is `0600` with a warning. Never expose or log the key.
- Structured logs redact authorization headers and API keys; do not log prompts, course text, or secrets.
- No analytics, telemetry, external fonts, remote images, or third-party requests. Only DeepSeek is contacted.
- Delete operations require explicit confirmation; deleting a subject with courses requires typed confirmation.

### Key management CLI

```text
npm run key:set       # hidden prompt or piped env; validates via /models
npm run key:status    # reports source and validity, never the key
npm run key:remove
npm run doctor        # Node, dirs, permissions, key, port, library readiness
```

If the key is missing, the app shows a persistent, actionable banner; generation actions are disabled.

---

## 8. Testing strategy

### Tooling

- **Vitest 5** through Angular’s unit-test builder for Angular and server unit tests.
- **Supertest** for API integration tests.
- **Playwright 1.64** for end-to-end and axe accessibility checks.
- Temporary directories and isolated env for every server test; no test touches the real home directory.
- Fake AI provider with deterministic output, configurable delay, failure injection, and partial-stream failure.

### Server tests

- Prompt builder snapshots: prior-course context restricted to topics/audiences; the exact “Assume the user has already taken these courses, and build on them” instruction; anti-repetition rule; additional instructions repeated in **every continuation prompt**; instruction delimiters; word budgets; with/without-instructions cases.
- Outline parser fixtures: valid, fence-wrapped, missing H2 fallback, separate TOC ignored, malformed, Unicode, LaTeX, H3 content, too many sections, duplicate titles.
- Path safety fuzzing: traversal, reserved names, case-insensitive collisions, Unicode normalization, symlinks.
- Library repository: CRUD, move, reorder, atomic writes, corrupt metadata, collisions, staging/finalization, permissions.
- Filesystem reconciliation: manual subject rename, manual course move, manual folder addition, corrupt metadata, interrupted subject rename, folder-name-wins repairs, warnings.
- Session state machine: legal/illegal transitions, restart recovery, pause/stop/resume, input edits from `outline_review` reset to draft and clear outline/prompts, regenerate blocked after expansion starts.
- Generation runner: success, streamed chunks, pause after current section, immediate stop, partial failure without retry, failed-is-paused-with-error semantics, resume, finalization retry, no duplicate writes.
- DeepSeek client: split SSE chunks, `[DONE]`, malformed events, 401/402/429/5xx, timeout, abort.
- API: validation, `ApiSuccess` envelope, status codes, error envelope, secret non-disclosure, origin/CSRF rejection, global `GENERATION_BUSY` lock behavior, draft listing/discard, SSE reconnect snapshot, CSP nonce presence.

### Angular tests

- Library store/search/move/reorder/delete behavior, including draft/active session listing and discard.
- Wizard form validation, step guards, preview rendering, outline review mapping, edit-inputs reset warning, regenerate disabled after expansion, failed labeled as paused-with-error.
- SSE reconnect and state reconciliation; token throttling; global-busy 409 messaging.
- Markdown sanitization with XSS fixtures; math rendering; remote-image stripping; table rendering.
- Reader outline links, “In this course” TOC, scroll behavior, and ephemeral-progress behavior.
- Dialog focus management and keyboard flows.

### End-to-end

1. Empty library → create subject → create course → preview exact prompt → generate outline → review continuation prompts → approve → streaming generation → reader shows Markdown, table, and KaTeX → verify the three files on disk.
2. Injected section failure → “Paused — needs attention” → manual resume → completion.
3. Pause, stop, navigate away, resume from the library in-progress strip; discard a draft from the strip and verify cleanup.
4. Edit inputs from outline review → confirm reset → outline/prompts are gone → generate a new outline; regenerate is unavailable after expansion starts.
5. Move course, reorder subjects, rename subject, delete with confirmation; manually rename/move folders and verify scan reconciliation.
6. Start a second course while one is generating → `GENERATION_BUSY` message and link to active session.
7. Missing/invalid key guidance; no generation occurs.
8. Keyboard-only and axe scan across library, wizard, generation, and reader; no CSP console violations.

Coverage gate for domain/application layers: 90% lines. UI coverage is behavioral, not a numeric vanity target.

`npm run verify` runs formatting check, lint, typecheck, unit tests, contracts validation, and production build. `npm run e2e` runs Playwright against the production build with fake AI.

---

## 9. Implementation sequence

### Milestone 0 — Foundation (1–2 days)

- Initialize git, npm workspaces, Angular workspace, server package, contracts package.
- Configure strict TS, ESLint, Prettier, Vitest, Playwright, scripts, `.gitignore`.
- Build config loader, logger redaction, error envelope, health endpoint.
- Add design tokens, base styles, app shell, shared UI primitives.
- **Exit:** `npm run verify` green; app shell and `/api/health` work.

### Milestone 1 — Library vertical slice (2–3 days)

- Contracts and Zod schemas for subjects, courses, metadata, order file.
- Path sanitization, atomic writes, filesystem repository, library indexing, staging, reorder, move, delete.
- Library API and UI, including optional simple search, drag reorder with keyboard fallback, dialogs, empty/error states, scan reconciliation.
- Temp-directory integration tests and a no-AI Playwright smoke test.
- **Exit:** full library management works without any AI involvement.

### Milestone 2 — Prompt and outline domain (2 days)

- Prompt builder v1, prior-course context rules, exact build-on instruction, anti-repetition rule, additional instructions in every continuation prompt, word-budget calculation.
- Outline parser, validation, outline renderer, final course assembler.
- Fake AI provider and fixtures.
- Snapshot/unit tests, including malformed and adversarial outlines, with/without additional instructions, and prior-course context.
- **Exit:** deterministic fixture generation produces valid `course.md`, `outline.md`, and `meta.json`.

### Milestone 3 — DeepSeek, sessions, streaming (3 days)

- Keychain/config/env secret store and CLI commands.
- DeepSeek streaming adapter, SSE parsing, timeouts, error mapping.
- Session repository, state machine, global generation lock, event bus, generation runner.
- Approval, pause, stop, resume, crash recovery, input-reset rules, regeneration guard, finalization.
- API routes and SSE; integration tests with fake provider.
- **Exit:** full generation lifecycle with failure/resume proven in automated tests.

### Milestone 4 — Wizard UX (3 days)

- Routed wizard, session loading, guards, subject combobox.
- Prompt preview, outline review with actual continuation prompts, live generation view.
- SSE client with reconnect and snapshot reconciliation.
- Key-missing banner, navigation-away behavior, in-progress library strip, draft discard, failed-as-paused messaging, global-busy messaging.
- **Exit:** complete create-to-save flow through the UI, including gates and failure recovery.

### Milestone 5 — Reader (2 days)

- Course read API and reader route.
- Sanitized Markdown + KaTeX component (lazy-loaded), outline card, TOC/scrollspy, ephemeral scroll indicator.
- Typography, responsive behavior, print styles, error states.
- XSS, math, table, and accessibility tests.
- **Exit:** course renders cleanly and safely from disk.

### Milestone 6 — Hardening and release (2–3 days)

- Security fuzzing, CSP nonce/headers, origin/CSRF checks, path tests, reconciliation tests.
- Accessibility audit and cross-browser/manual QA.
- Performance budgets: initial bundle target < 350 KB gzip; Markdown/KaTeX lazy-loaded.
- Production static serving, browser launch, graceful shutdown, doctor/smoke commands.
- README, architecture/API/prompt docs, ADRs, optional GitHub Actions workflow.
- **Exit:** all acceptance criteria and e2e tests pass.

Estimated total: **18–22 focused developer days** including the quality extras. The MVP-critical path is approximately **14–16 days** if optional library search/filter, print styles, token estimates, and the release smoke test are deferred. The earlier 14–18 estimate was optimistic once those extras were included.

Milestone 4 can start against API contracts while Milestone 3 is finishing; the reader can be parallelized once the course read contract is stable.

---

## 10. Deployment and operations

- Prerequisites: Node 24.15+ and npm. No database, Docker, or cloud service.
- Development: `npm run dev` runs the server with watch mode and Angular dev server with `/api` proxy.
- Production: `npm ci && npm run build && npm start`.
- `npm start` serves the static Angular build and API from `127.0.0.1:4310`, opens the browser unless `--no-open`, verifies the build exists, and prints actionable startup errors.
- Static assets use immutable hashed caching; `index.html` is no-store; SPA fallback excludes `/api`.
- Graceful shutdown aborts active generation, converts running sessions to resumable `paused`, closes SSE connections, and flushes logs.
- `npm run doctor` validates Node version, writable directories, key source/validity, port availability, and library readability.
- A release smoke test starts the built server with a temporary library, checks health, index HTML, and one fake-AI course write.
- The README documents setup, key commands, library/data locations, backup by copying the library, privacy guarantees, troubleshooting, and uninstall.

---

## 11. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| AI returns an inconsistent outline | Strict prompt contract, tolerant lexer-based parser, validation error with regenerate path, fixture tests |
| Long/streaming calls appear stalled | First-byte/idle timeouts, heartbeats, live tokens, explicit failure states, manual resume |
| XSS or malicious Markdown | Raw HTML disabled, DOMPurify allowlist, KaTeX trust disabled, images stripped, adversarial tests |
| Local web-service attacks | Loopback binding, Host/Origin checks, required custom header on mutations, CSP, no CORS |
| Keychain unavailable on Linux | Config-file fallback with `0600` permissions and a clear CLI warning |
| Folder collisions or manual reorganizing | Stable UUIDs, sanitized names, collision suffixes, hidden metadata, atomic staging rename |
| Crash during generation | Persist after every section, restart recovery to paused, idempotent finalization |
| Flat subject model assumed | “Move subject” is reorder only; nesting would be a scope change and is documented as an assumption |
| Quality extras expand schedule | Mark search/filter, print styles, token estimates, and smoke tests as optional; report both full and critical-path estimates |
| Scope creep into Phase 2 | No conversation routes/UI; provider and folder extension points documented only |

---

## 12. Acceptance criteria mapping

| Requirement | Covered by |
|---|---|
| Create course from subject/topic/audience | Wizard Milestone 4 + e2e flow 1 |
| Exact-preview guarantee, cancel/edit | Persisted draft session, server-rendered prompt preview, route rebinding, prompt review step, draft discard |
| Prompt fidelity: additional instructions reach section prose | Instructions repeated in every continuation prompt via shared brief + snapshot tests |
| Prior-course context: topics/audiences only, exact build-on sentence, no outlines, anti-repetition | Prompt builder rules + snapshot tests |
| Two approval gates, automated expansion | State machine + wizard outline review |
| Editing inputs after outline review resets to draft | State machine reset rule + API/UI tests |
| Regeneration cannot discard completed sections | `409 EXPANSION_STARTED` after expansion begins + tests |
| Saved Markdown in correct subject folder | Staging + atomic finalize + repository tests |
| Markdown and LaTeX reading view | Reader Milestone 5 + sanitization/math tests |
| Reader provides TOC despite no separate AI TOC | “In this course” card + outline links tests |
| Library create/move/reorder/delete | Library Milestone 1 + API/UI tests |
| Watch status, pause/stop, failure without retry | Streaming runner + generation view; `failed` is paused-with-error |
| Durable manual resume | Session repository, restart recovery, in-progress strip |
| Fully local, DeepSeek-only | Loopback server, no external assets/telemetry, CSP, offline fonts |
| Filesystem mirror stays consistent | Scan/reconciliation policy + manual rename/move tests |
| Phase 2 deferred | No conversation UI or APIs; documented extension points |
