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

## Shutdown

SIGINT/SIGTERM abort active runs with reason `interrupted`, wait briefly for runners to persist paused
state, close SSE subscribers, then close the HTTP server. A forced-exit timeout prevents a stuck
connection from blocking shutdown.

## Extension points

- Additional AI providers implement the `AiProvider` port and are selected in the composition root.
- Phase 2 conversations can live under a future `conversations/` library extension without changing
  course snapshots or the reader.
