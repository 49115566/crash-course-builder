# Crash Course Builder

A private, local-first Angular and Node application for building and reading short AI-generated
crash courses. Courses are stored as readable Markdown files inside a folder library on your own
computer.

## Current status

Milestones 1 (Library) and 2 (Prompt and outline domain) are implemented.

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

Sessions, API routes for generation, the real DeepSeek adapter, the wizard, the reader, and the
key-management CLI arrive in later milestones. **No AI key is required yet.** The library can be
managed now; course cards appear for valid course folders already present on disk.

## Prerequisites

- Node.js **24.15 or newer** (Node 24 LTS recommended; Node 25 is not supported)
- npm **11 or newer**

## Install

```bash
npm ci
```

For a fresh checkout that has not generated a lockfile yet, use `npm install`.

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

## Library

By default, the library lives at `~/CrashCourses`. The server creates it on first start, along with
a private `.crash-course-builder/` metadata folder.

```text
<library root>/
├── .crash-course-builder/
│   ├── library.json          # subject order only
│   └── staging/              # hidden delete staging area
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
| `CCB_DATA_DIR`          | OS application data directory | Session and application data (sessions arrive in Milestone 3)   |
| `CCB_CONFIG_DIR`        | OS configuration directory    | Configuration fallback                                          |
| `CCB_MODEL`             | `deepseek-chat`               | AI model name                                                   |
| `CCB_DEEPSEEK_BASE_URL` | `https://api.deepseek.com`    | DeepSeek API base URL                                           |
| `CCB_LOG_LEVEL`         | `info`                        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `CCB_WEB_DIST`          | `apps/web/dist/web/browser`   | Optional web build override                                     |

## Project layout

```text
apps/web/          Angular application
apps/server/       Express API, filesystem library, prompt/outline domain, and fake AI adapter
packages/contracts Shared Zod schemas, DTOs, error codes, prompt/outline types, and constants
docs/              Prompt contract, architecture decisions, and future API/architecture notes
e2e/               Playwright specs, helpers, and isolated server launcher
```

The build order is contracts → web → server. Angular and Node consume the built contracts package.

## Privacy and security baseline

- No analytics or telemetry.
- Fonts are self-hosted through Fontsource; the app makes no external requests while managing the
  library.
- The server binds `127.0.0.1` only.
- The library API requires local paths to stay inside the configured library root and rejects path
  separators, traversal, reserved names, and symbolic links.
- Structured logs redact authorization headers, cookies, API-key fields, and secret fields.
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
- **A repair warning appears:** the folder tree changed outside the app, or metadata was corrupt.
  Review the warning details; course files are not deleted automatically.
- **Playwright cannot find Chromium:** run `npm run e2e:install`.
- **Angular dev server shows an API error:** confirm the server is listening on port 4310.
