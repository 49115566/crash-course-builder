# Crash Course Builder

A private, local-first Angular and Node application for building and reading short AI-generated
crash courses. Courses are stored as readable Markdown files inside a folder library on your own
computer.

## Current status

Milestones 1 (Library), 2 (Prompt and outline domain), and 3 (DeepSeek, sessions, streaming) are
implemented.

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

The wizard and reader screens arrive in later milestones. The library remains fully usable without
an AI key.

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

| Command                 | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`           | Run contracts, server, and web watchers                                         |
| `npm run key:set`       | Store and validate the DeepSeek API key                                         |
| `npm run key:status`    | Show the key source and validity                                                |
| `npm run key:remove`    | Remove stored keychain/config keys                                              |
| `npm run doctor`        | Check Node, directories, key, port, and library readiness                       |
| `npm run build`         | Build contracts, web, and server in order                                       |
| `npm start`             | Serve the production build from loopback                                        |
| `npm run verify`        | Format check, lint, contract validation, typecheck, tests, and production build |
| `npm test`              | Run contracts, server, and Angular unit tests                                   |
| `npm run test:coverage` | Run tests with coverage reporting                                               |
| `npm run e2e`           | Build and run Playwright against an isolated temporary library                  |
| `npm run e2e:install`   | Install the Chromium browser used by Playwright                                 |
| `npm run format`        | Format the repository                                                           |
| `npm run clean`         | Remove build and test output                                                    |

Run the browser suite once with:

```bash
npm run e2e:install
npm run e2e
```

The e2e server uses `.tmp/e2e/`, never your real library.

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
| `DEEPSEEK_API_KEY`      | unset                         | Highest-precedence API key source                               |

## Project layout

```text
apps/web/          Angular application
apps/server/       Express API, filesystem library, sessions, DeepSeek adapter, CLI, and fake AI
packages/contracts Shared Zod schemas, DTOs, error codes, prompt/outline types, and constants
docs/              Prompt contract, API, architecture, and architecture decision records
e2e/               Playwright specs, helpers, and isolated server launcher
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
- Baseline security headers are enabled. CSP nonce injection, origin/CSRF enforcement, and the full
  hardening pass are scheduled for Milestone 6.
- Secrets are never returned by the health endpoint.

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
- **Playwright cannot find Chromium:** run `npm run e2e:install`.
- **Angular dev server shows an API error:** confirm the server is listening on port 4310.
