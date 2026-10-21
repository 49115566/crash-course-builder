# Architecture

## Layers

```text
Angular app
  └── /api HTTP + SSE
        └── Express routes
              └── application services (library, sessions, generation)
                    ├── domain (prompts, parser, assembler, state rules)
                    └── ports
                          ├── filesystem library/session repositories
                          ├── DeepSeek adapter
                          └── secret store
```

Domain code has no Express, filesystem, or network imports. Filesystem, provider, keychain, and
clock/ID dependencies are injected from `main.ts` or test fixtures.

## Request security

Every request passes through the same pipeline:

1. Request ID and structured logging.
2. Strict security headers, including a CSP built around a per-process nonce.
3. API no-store caching.
4. Loopback-only Host validation and, when present, loopback-only Origin validation.
5. The `x-ccb-request: 1` requirement for mutating API requests.
6. Body parsing and route handlers.

The production index is rendered by the server so the same nonce appears in the CSP header and in
`<ccb-root ngCspNonce="…">`. Angular reads that attribute and applies the nonce to its runtime
style tags. Production builds disable critical-CSS inlining, so the index contains no inline scripts
or style blocks. KaTeX's generated style attributes are the only `style-src-attr 'unsafe-inline'`
exception; untrusted Markdown style attributes are stripped before rendering.

The server binds only `127.0.0.1`. Cross-origin requests are rejected, there is no CORS middleware,
and the custom mutation header blocks cross-site form/fetch attacks. Static assets and the SPA
fallback are subject to the same Host/Origin guard.

## Static serving and performance

`express.static` serves hashed assets with immutable caching and non-hashed public files with a short
cache lifetime. `index.html` is always `no-store` and always receives the current CSP nonce, whether
requested directly or through the SPA fallback.

The initial route contains only the application shell, shared styles, and the library route. Reader
Markdown/KaTeX JavaScript is lazy-loaded with `/courses/:id`; KaTeX CSS and fonts are copied to
`vendor/katex/` and linked only when the reader mounts. `npm run check:size` parses the built index,
gzips every initial asset, and fails the release if the initial graph exceeds 350 KiB gzip.

## Library and finalization

Courses are assembled in a hidden staging directory:

1. Scan the library and resolve the current subject by stable UUID.
2. Recreate `.crash-course-builder/staging/finalize-<courseId>`.
3. Write `course.md`, `outline.md`, and `meta.json` with owner-only permissions, fsync files and
   staging directory.
4. Choose a collision-safe folder name from the topic.
5. Atomically rename the staging directory into the subject and fsync the subject directory.

The library never shows a half-written course. Finalization is idempotent by `courseId`: if a crash
happens after the rename but before the session save, resume detects the existing course and marks
the session complete without generating anything again.

## Sessions and generation

Session snapshots live at `<data dir>/sessions/<sessionId>.json`, with atomic writes and `0600`
permissions. Only checkpoints are persisted: state changes, section start, section completion,
failure, and finalization. Streaming tokens are published over SSE but not written to disk.

A global process-wide lock allows one active generation at a time. It is not a queue: a second start
returns `GENERATION_BUSY`. A per-session mutation lock prevents duplicate starts and lost updates.
Each run also has an opaque run token so a deleted or cancelled run cannot recreate its session.

Pause checks happen at section boundaries. Stop aborts the active provider call immediately and
discards partial output. On server startup, any session left in an active state is converted to
`paused` with reason `interrupted`; running sections return to `pending`.

Finalization failure marks the session failed at stage `finalization`. Resume in that stage calls the
library finalizer only — no AI provider calls are made. Completed section Markdown remains in the
snapshot.

## Wizard and SSE reconciliation

The Angular wizard is a lazy-loaded route family under `/courses/new`. The parent layout provides one
`SessionWizardStore` for the whole flow, so moving between steps keeps the live event stream and
avoids duplicate session loads.

- `/courses/new/:sessionId/edit` exists so input editing stays refreshable.
- `/courses/new/:sessionId` is a redirect route that chooses the correct step from status and stage.
- A read-only outline view remains reachable after writing starts, so the disabled-regeneration
  explanation is visible without exposing an action the server would reject.
- The reader route is lazy-loaded from `/courses/:id`. Library cards and the wizard’s “Read course”
  action link to it.

SSE handling has two layers:

1. Named events update the local signals immediately for a responsive live view.
2. A short coalesced refresh reconciles the authoritative session snapshot after semantic events.
   Stale responses are ignored with a request sequence token, and live text for the currently running
   section is preserved across those refreshes and transport reconnects. A fresh snapshot after a
   stage change resets the live buffers.

Token deltas are buffered client-side for roughly 50 ms in addition to the server's 50 ms
coalescing. This keeps rendering and screen-reader activity calm. Section boundaries and completion
are announced via `LiveAnnouncer`; individual tokens are not.

## Reader

The reader is a lazy-loaded route family under `/courses/:id`. It fetches the course detail from the
server and never writes to the library.

- `ngx-markdown` renders the on-disk Markdown. A custom `marked` renderer drops raw HTML and images
  before rendering.
- A custom DOMPurify sanitizer is supplied through ngx-markdown’s `SANITIZE` token. It uses a strict
  allowlist, removes remote media and unsafe URI schemes, and strips style and event attributes.
- KaTeX runs after sanitization on the sanitized DOM, with `trust: false`, bounded expansion, and
  skipped code blocks. This keeps KaTeX-generated inline styles outside the untrusted Markdown
  boundary.
- The canonical H2 headings in `course.md` provide the table of contents and heading anchors. The
  leading H1 is shown through metadata in the hero, while the remaining cover content is rendered
  from the file.
- Scrollspy, the progress line, and back-to-top controls are ephemeral. Nothing is written to
  storage and no completion state is tracked.
- The “In this course” card is always present at the top. A sticky sidebar appears on wide screens
  and a focus-trapped CDK dialog provides the contents drawer on smaller screens.
- Print styles hide application chrome and controls, leaving the course document.

## Provider

`DeepSeekProvider` uses native `fetch` against an OpenAI-compatible `/chat/completions` endpoint and
parses SSE itself. It enforces a 45-second first-byte timeout, 60-second idle timeout, and 10-minute
absolute call limit. HTTP status and network/timeout aborts map to the shared error codes. There is no
internal retry loop.

A deterministic fake provider is used for automated tests and can be selected locally with
`CCB_AI_PROVIDER=fake`. It never contacts the network.

## Secrets

Resolution order:

1. `DEEPSEEK_API_KEY` environment variable.
2. OS keychain via `@napi-rs/keyring`.
3. `<CCB_CONFIG_DIR>/credentials.json` fallback with owner-only permissions.

The key is resolved lazily and never placed in `AppConfig`, API responses, session snapshots, or
logs. If the keychain is unavailable, the CLI stores the fallback file and prints a warning.

## SSE

The event bus fans out per session, coalesces token deltas, and flushes pending deltas before any
non-delta event. The SSE route subscribes before reading the snapshot so events cannot race the
initial state: events are buffered, the authoritative snapshot is sent, then buffered events are
flushed. Heartbeats keep proxies and browsers from treating the stream as stalled.

## Production startup and release

`npm start` runs `scripts/start.mjs`. The wrapper sets `NODE_ENV=production`, verifies the server
build, and starts the compiled server with `--require-web-build`. The server refuses to start if the
Angular `index.html` is missing. After listening, it opens the local URL with the platform opener
unless `--no-open`, `CCB_NO_OPEN=1`, or `CI` is set. Browser-open failures are warnings; they never
stop the server.

`npm run smoke` spawns the same production start path against an isolated temporary library, checks
health, index HTML, CSP nonce injection, a complete fake-AI course write, graceful shutdown, and
interrupted-session recovery. `npm run doctor` validates Node, writable directories, permissions,
port availability, the library scan, the web build, and key source/validity.

## Shutdown

SIGINT/SIGTERM abort active runs with reason `interrupted`, wait briefly for runners to persist paused
state, close SSE subscribers, then close the HTTP server. A forced-exit timeout prevents a stuck
connection from blocking shutdown.

## Extension points

- Additional AI providers implement the `AiProvider` port and are selected in the composition root.
- Phase 2 conversations can live under a future `conversations/` library extension without changing
  course snapshots or the reader.
- The wizard's step mapping and stream client are reusable for any future AI workflow that persists
  session snapshots.
