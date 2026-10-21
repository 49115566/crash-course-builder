# Crash Course Builder

A private, local-first Angular and Node application for building and reading short AI-generated
crash courses. Courses are stored as readable Markdown files inside a folder library on your own
computer.

## Current status

Milestones 1 (Library), 2 (Prompt and outline domain), 3 (DeepSeek, sessions, streaming), 4
(Wizard UX), 5 (Reader), and 6 (Hardening and release) are implemented.

Milestone 1:

- Shared Zod contracts for subjects, courses, metadata, library order, and API requests.
- A filesystem-backed course library with sanitized folder names, stable UUIDs, atomic writes,
  restrictive permissions, hidden metadata, and staging-based deletion.
- Subject creation, renaming, reordering, and deletion; course moving and deletion.
- Library scanning with automatic reconciliation of manual folder renames and moves, plus
  non-destructive warnings for corrupt or unexpected content.
- A responsive library screen with search, drag reordering, keyboard-friendly subject actions,
  dialogs, toasts, skeletons, scan warnings, and accessible empty/error states.
- Unit, API integration, filesystem integration, and Playwright workflow tests, including a
  temporary-library no-AI workflow and axe accessibility checks.

Milestone 2:

- Prompt contract v1 with exact starting and continuation prompts, prior-course context rules,
  additional-instruction fidelity, word budgets, and token estimates.
- A `marked` lexer-based outline parser with tolerant recovery, strict validation, actionable
  `OUTLINE_INVALID` errors, and fixtures for malformed and adversarial responses.
- Standalone `outline.md` rendering and a canonical course assembler that removes Mermaid, images,
  duplicate headings, and dangerous HTML while producing schema-valid `meta.json`.
- A deterministic fake AI provider with chunking, delays, abort support, and failure injection.
- A full pipeline test that generates, writes, reads, and rescans all three course files.

Milestone 3:

- OS keychain, environment, and private config-file secret storage plus `key:set`, `key:status`,
  `key:remove`, and `doctor` commands.
- A native-fetch DeepSeek streaming adapter with SSE parsing, first-byte/idle/absolute timeouts, and
  explicit error mapping. It never retries automatically.
- Durable file-backed sessions, the full state machine, two approval gates, pause/stop/manual resume,
  crash recovery, input-reset rules, regeneration guards, and idempotent course finalization.
- One process-wide generation lock, per-session mutation serialization, an SSE event bus, and
  coalesced token streaming with authoritative snapshots on reconnect.
- Session, bootstrap, health, and event APIs, covered by fake-provider lifecycle, failure/resume,
  stop/delete, crash recovery, and SSE integration tests. A key is required for generation;
  `CCB_AI_PROVIDER=fake` runs the deterministic test provider without contacting the network when a
  non-empty test key is present.

Milestone 4:

- Refresh-safe wizard routes for details, exact prompt preview, outline review, and live writing,
  with guards that resume a session at the correct step.
- A searchable subject combobox with inline subject creation, validated inputs, and a 7-day draft
  lifecycle surfaced in the library.
- Server-rendered starting and continuation prompt previews, including prior-course chips, token
  estimates, and the exact-message guarantee before any AI call.
- Live SSE streaming with authoritative snapshot reconciliation, reconnects, buffered token updates,
  section progress, pause/stop controls, and manual resume.
- Failure presented as “Paused — needs attention”, global `GENERATION_BUSY` guidance, a persistent
  missing-key banner, and an in-progress library strip with discard actions.
- Wizard, realtime, API, and accessibility tests plus isolated Playwright servers for happy path,
  failure/resume, keyless, and global-busy scenarios.

Milestone 5:

- A lazy-loaded `/courses/:id` reader that opens any saved course directly from its three files on
  disk, with no AI key required.
- Sanitized GFM Markdown rendering with tables, heading anchors, responsive code blocks, and
  self-hosted KaTeX math. Raw HTML, remote images, and unsafe link protocols are removed.
- A book-like cover, an “In this course” outline card, a sticky desktop contents sidebar, a mobile
  contents drawer, and an ephemeral reading-progress indicator with scroll tracking.
- Reading progress is never persisted. The reader is read-only; course management stays in the
  library.
- Print styles, loading skeletons, incomplete-file and not-found states, accessible overflow actions,
  and axe/Playwright coverage across desktop, mobile, and print.

The library, wizard, and reader remain fully usable without an AI key, although generation is
disabled until a key is configured.

Milestone 6:

- A strict Content-Security-Policy with a per-process nonce injected into the app root and Angular's
  `ngCspNonce`, plus loopback-only Host/Origin validation and a required `x-ccb-request` header on
  every mutating API call.
- Immutable caching for hashed assets, lazy-loaded KaTeX CSS, and a release gate that fails if the
  initial JavaScript/CSS graph exceeds **350 KiB gzip**.
- A production `npm start` wrapper that verifies the build, opens the browser unless `--no-open` is
  supplied, forwards shutdown signals, and logs actionable errors.
- An enhanced `doctor` command and a release `smoke` command that starts the built server against an
  isolated temporary library, completes a fake-AI course, and verifies graceful shutdown/recovery.
- Path-safety fuzzing, interrupted-reconciliation repair tests, keyboard/axe checks, security tests,
  and full Playwright runs in Chromium, Firefox, and WebKit.
- Release documentation, ADRs, a manual QA checklist, and an optional GitHub Actions workflow.

## Prerequisites

- Node.js **24.15 or newer** (Node 24 LTS recommended; Node 25 is not supported)
- npm **11 or newer**

## Install

```bash
npm ci
```

For a fresh checkout that has not generated a lockfile yet, use `npm install`.

## DeepSeek key

The key is resolved from `DEEPSEEK_API_KEY`, then the OS keychain, then a private fallback file in the
config directory.

```bash
npm run key:set       # hidden prompt or piped input; validates before saving
npm run key:status    # source and validity, never the key itself
npm run key:remove
npm run doctor        # Node, directories, key, port, and library readiness
```

Piped input works for scripted setup:

```bash
printf '%s' "$DEEPSEEK_API_KEY" | npm run key:set
```

If the keychain is unavailable, the key is stored in `<CCB_CONFIG_DIR>/credentials.json` with
`0600` permissions and a warning. The server starts in a degraded health state when no key is
configured; library management still works.

## Development

```bash
npm run dev
```

This builds the contracts package, then runs three watchers:

- Contracts compiler
- Server at <http://127.0.0.1:4310>
- Angular dev server at <http://127.0.0.1:4200>

Open the Angular dev server. Requests to `/api` are proxied to the local Node service. The server
binds to loopback only.

## Production-style local run

```bash
npm run build
npm start
```

Open <http://127.0.0.1:4310>. The Node process serves both the built Angular app and the API.
`npm start` opens your default browser; use `npm start -- --no-open`, `CCB_NO_OPEN=1`, or `CI=1` to
suppress that. It refuses to start if the Angular build is missing, with an instruction to run
`npm run build` first.

## Course wizard

Open **New course** from the library, or go directly to `/courses/new`.

1. **Details** — choose a subject (or create one inline), then give the course a topic, audience, and
   optional instructions.
2. **Prompt preview** — review the exact system and user messages, prior-course context, and token
   estimate. No AI call has happened yet.
3. **Outline review** — inspect the cover, numbered sections, and the exact continuation prompt for
   every section, then approve. Regeneration is available only before writing starts.
4. **Writing** — watch live section progress, pause after the current section, stop immediately, or
   leave the page. Generation continues locally and can be resumed from the library.

Failed calls are shown as **Paused — needs attention** and never retry automatically. If another
course is being generated, the second session stays a draft and the UI links to the active course.
Closing the app during generation turns the session into a paused/interrupted session on restart.
Discarding a session never deletes a course that has already been saved.

## Reading courses

Open any course from the library card, or use **Read course** after generation. Reading works
without an AI key.

- Courses render from `course.md` with safe Markdown, GFM tables, code blocks, and self-hosted KaTeX
  math. Raw HTML, remote images, and unsafe links are removed.
- The “In this course” card at the top links to every numbered section. Wide screens also show a
  sticky contents sidebar; narrow screens use a focus-trapped contents drawer.
- Scrollspy, the reading-progress line, and back-to-top are in-memory only. No reading progress is
  saved or sent anywhere.
- The overflow menu can print the course, copy its link, or return to the library. Print styles
  remove application chrome and leave the course document.
- A missing `course.md` or `outline.md` produces an actionable error without modifying the folder.

## Sessions

Session snapshots live under the OS application data directory (override with `CCB_DATA_DIR`) in
`sessions/`. They are written atomically with `0600` permissions and contain the exact prompts,
outline, per-section state, token usage, and reserved course id. Drafts untouched for seven days are
removed on startup. A server restart converts active sessions to paused/interrupted; resume is always
manual.

## Library

By default, the library lives at `~/CrashCourses`. The server creates it on first start, along with
a private `.crash-course-builder/` metadata folder.

```text
<library root>/
├── .crash-course-builder/
│   ├── library.json          # subject order only
│   └── staging/              # hidden finalization/delete area
├── Computer Science/
│   ├── .subject.json         # stable subject id and metadata
│   └── Vector Databases/
│       ├── course.md
│       ├── outline.md
│       └── meta.json
└── Marketing/
```

- Folder names are readable and sanitized. Subject and course IDs are stable UUIDs, so renaming a
  folder does not break links.
- New directories use `0700` permissions and app-written files use `0600`.
- JSON writes are atomic: temporary file, fsync, then rename.
- Course deletion moves the folder into hidden staging before removal, so the library never shows a
  half-deleted course.
- Hidden folders are excluded from the library index.

### Scan reconciliation

Real folders are authoritative for existence and location:

- Manually added subject folders are adopted with a new UUID.
- Manual subject renames and course moves are repaired on the next scan. The folder name wins.
- Corrupt metadata is reported as a warning and left untouched.
- Missing course metadata is never silently adopted or deleted.
- Duplicate IDs, nested folders, and symbolic links are reported or skipped safely.
- Warnings appear in the library UI and do not block normal management.

## Scripts

| Command                 | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`           | Run contracts, server, and web watchers                                           |
| `npm run key:set`       | Store and validate the DeepSeek API key                                           |
| `npm run key:status`    | Show the key source and validity                                                  |
| `npm run key:remove`    | Remove stored keychain/config keys                                                |
| `npm run doctor`        | Check Node, directories, permissions, key, port, web build, and library readiness |
| `npm run build`         | Build contracts, web, and server in order                                         |
| `npm start`             | Verify and serve the production build; opens the browser unless `--no-open`       |
| `npm run verify`        | Full gate: format, lint, coverage, typecheck, production build, and size check    |
| `npm run verify:fast`   | Format, lint, typecheck, and unit tests without coverage or a production build    |
| `npm test`              | Run contracts, server, and Angular unit tests in parallel                         |
| `npm run test:coverage` | Run all workspace tests with coverage reporting                                   |
| `npm run e2e`           | Run Playwright in Chromium, building only when artifacts are stale                |
| `npm run e2e:all`       | Run the full Playwright matrix in Chromium, Firefox, and WebKit                   |
| `npm run e2e:fast`      | Alias for the default Chromium E2E run                                            |
| `npm run e2e:smoke`     | Run the tagged smoke subset in Chromium                                           |
| `npm run e2e:chromium`  | Alias for the default Chromium E2E run                                            |
| `npm run e2e:firefox`   | Run the Playwright suite in Firefox only                                          |
| `npm run e2e:webkit`    | Run the Playwright suite in WebKit only                                           |
| `npm run e2e:install`   | Install the Chromium, Firefox, and WebKit browsers                                |
| `npm run smoke`         | Start the built server with a temporary library and run a fake-AI release smoke   |
| `npm run check:size`    | Enforce the 350 KiB gzip initial-bundle budget                                    |
| `npm run format`        | Format the repository                                                             |
| `npm run clean`         | Remove build and test output                                                      |

Release validation:

```bash
npm run verify
npm run e2e:all
npm run smoke
```

See [release checklist](./docs/release-checklist.md) and [manual QA checklist](./docs/qa-checklist.md)
for the full sign-off pass.

Run the browser suite once with:

```bash
npm run e2e:install
npm run e2e
```

`npm run e2e` is the fast local path: it runs Chromium, skips the build when artifacts are current,
and starts one isolated server per spec file. `npm run e2e:all` runs the same suite in Chromium,
Firefox, and WebKit for release validation. Each server gets its own library/data/config root under
`.tmp/e2e/`, so parallel workers never share state and never touch your real library.

Wizard tests use a fast fake-AI mode unless they exercise pause, stop, resume, or the generation lock;
those tests use a slower streaming mode at a fraction of the previous delay. Override local
parallelism with `CCB_E2E_WORKERS=<n>`.

## Configuration

Configuration is read from environment variables. No `.env` file is loaded automatically.

| Variable                | Default                       | Purpose                                                         |
| ----------------------- | ----------------------------- | --------------------------------------------------------------- |
| `CCB_PORT`              | `4310`                        | Local server port                                               |
| `CCB_LIBRARY_ROOT`      | `~/CrashCourses`              | Course library root                                             |
| `CCB_DATA_DIR`          | OS application data directory | Session snapshots and application data                          |
| `CCB_CONFIG_DIR`        | OS configuration directory    | Configuration fallback                                          |
| `CCB_MODEL`             | `deepseek-chat`               | AI model name                                                   |
| `CCB_AI_PROVIDER`       | `deepseek`                    | `deepseek` or `fake` for deterministic, offline tests           |
| `CCB_DEEPSEEK_BASE_URL` | `https://api.deepseek.com`    | DeepSeek API base URL                                           |
| `CCB_LOG_LEVEL`         | `info`                        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `CCB_WEB_DIST`          | `apps/web/dist/web/browser`   | Optional web build override                                     |
| `CCB_NO_OPEN`           | unset                         | Set to `1` to stop `npm start` opening a browser                |
| `DEEPSEEK_API_KEY`      | unset                         | Highest-precedence API key source                               |

The following variables are only used by the deterministic fake provider. They exist for automated
tests and local demos; the DeepSeek provider ignores them.

| Variable                        | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `CCB_FAKE_AI_DELAY_MS`          | Delay between streamed chunks                                   |
| `CCB_FAKE_AI_CHUNK_SIZE`        | Characters per streamed chunk                                   |
| `CCB_FAKE_AI_FAIL_SCOPE`        | `outline` or `section`                                          |
| `CCB_FAKE_AI_FAIL_SECTION`      | Section number to fail                                          |
| `CCB_FAKE_AI_FAIL_AFTER_CHUNKS` | Chunks to emit before failing                                   |
| `CCB_FAKE_AI_FAIL_ONCE`         | `true` to consume the failure after one use                     |
| `CCB_FAKE_AI_FAIL_CODE`         | `AI_UPSTREAM`, `AI_TIMEOUT`, `AI_RATE_LIMITED`, or `AI_NETWORK` |

Tests can also set `CCB_DISABLE_KEYCHAIN=true` to keep key resolution away from the developer's OS
keychain. This is used by the isolated Playwright servers so keyless tests are deterministic.

## Project layout

```text
apps/web/          Angular application
apps/server/       Express API, filesystem library, sessions, DeepSeek adapter, CLI, and fake AI
packages/contracts Shared Zod schemas, DTOs, error codes, prompt/outline types, and constants
docs/              Prompt contract, API, architecture, ADRs, and QA/release checklists
e2e/               Playwright specs, helpers, and isolated server launcher
scripts/           Production start, release smoke, and bundle-size checks
.github/           Optional CI workflow (verify, cross-browser E2E, smoke)
```

The build order is contracts → web → server. Angular and Node consume the built contracts package.

## Privacy and security baseline

- No analytics or telemetry.
- Fonts are self-hosted through Fontsource; the app makes no external requests while managing the
  library. Generation contacts only the configured DeepSeek endpoint.
- The server binds `127.0.0.1` only.
- The library API requires local paths to stay inside the configured library root and rejects path
  separators, traversal, reserved names, and symbolic links.
- Structured logs redact authorization headers, cookies, API-key fields, and secret fields; prompts,
  course text, and API keys are never logged.
- API responses use `Cache-Control: no-store`; hashed static assets are cached immutably.
- Every response carries a strict CSP with a per-process nonce. The nonce is injected into the
  Angular app root so runtime style tags are allowed. Inline scripts are absent, `eval` is blocked,
  and only the self-hosted app and DeepSeek endpoint are reachable.
- Static files and the SPA fallback pass through the same local request guard. Requests with a
  non-loopback `Host`, a non-local `Origin`, or a mutating API call without `x-ccb-request: 1` are
  rejected with `403 FORBIDDEN`.
- Raw HTML and remote images are removed from Markdown. KaTeX runs with `trust: false`. KaTeX's
  generated inline style attributes are the only deliberate `style-src-attr 'unsafe-inline'`
  exception; untrusted Markdown style attributes are stripped before rendering.
- Secrets are never returned by the health endpoint.

## Backup and uninstall

Your courses are ordinary folders. To back up everything, copy the library root (default
`~/CrashCourses`). Session snapshots under the OS data directory are optional and can be omitted from
a course backup.

To uninstall, remove the app directory, the library root, the OS data/config directories, and any
stored key:

```bash
npm run key:remove
rm -rf ~/CrashCourses
```

Do not delete the library root unless you have a backup. Removing app data does not delete saved
courses.

## Troubleshooting

- **`Unsupported engine` during install:** use Node 24.15+ or Node 26+.
- **Port already in use:** stop the other process or set `CCB_PORT`.
- **“Local service unavailable” in the footer:** the browser loaded but the Node service is not
  running. Start `npm run dev` or `npm start`.
- **“Library unavailable”:** check that `CCB_LIBRARY_ROOT` exists or can be created, and that the
  current user can read and write it.
- **Generation is disabled / health is degraded:** run `npm run key:status`; if no key is configured,
  run `npm run key:set`. `npm run doctor` checks the key source, directories, and port.
- **A repair warning appears:** the folder tree changed outside the app, or metadata was corrupt.
  Review the warning details; course files are not deleted automatically.
- **Generation is disabled with a key banner:** run `npm run key:set`, then use **Recheck** in the
  banner (or reload the page). The key itself is never displayed.
- **Generation fails with `AI_NETWORK` even though the key is valid:** see
  [KI-001](./docs/known-issues.md#ki-001-deepseek-streaming-always-fails-with-ai_network). This is a
  known DeepSeek `usage: null` parsing bug, not a connectivity problem.
- **Playwright cannot find a browser:** run `npm run e2e:install`.
- **`403 FORBIDDEN` from a hand-written API call:** mutating API calls need the local CSRF header
  `x-ccb-request: 1` and must address `127.0.0.1` or `localhost`. The Angular app adds this header
  automatically.
- **`npm start` says the Angular build is missing:** run `npm run build` first, then `npm start`.
- **The browser did not open:** open the printed URL manually, or check that `xdg-open`/`open` is
  available. The server is still running when browser launch fails.
- **CSP errors appear in the browser console:** report them with the affected screen. The app is
  expected to load with no CSP violations in Chromium, Firefox, and WebKit.
- **Angular dev server shows an API error:** confirm the server is listening on port 4310.
