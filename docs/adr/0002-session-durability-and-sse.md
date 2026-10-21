# ADR 0002: Durable sessions with manual recovery

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Generation spans multiple AI calls and can fail, be paused, be stopped, or be interrupted by a crash.
Users need an exact prompt preview, completed work must never be lost, and a failure must not silently
discard sections or restart an expensive workflow.

## Decision

- Sessions are persisted as complete JSON snapshots in the application data directory.
- The state machine separates `status` from `stage`, so failed and paused sessions know exactly where
  to resume.
- AI calls have no automatic retry. `failed` means "paused with an error"; only an explicit resume
  continues.
- Completed sections are persisted immediately. Streaming tokens are not persisted and partial output
  is discarded on stop or restart.
- A process-wide single-generation lock prevents concurrent workflows and returns
  `GENERATION_BUSY` with the active session id.
- SSE sends an authoritative snapshot on every connection, buffers races during subscription, and
  coalesces token deltas. Reconnection never restarts AI work.
- Finalization is idempotent by the reserved `courseId`.

## Consequences

- Refresh, navigation, server restart, and multiple tabs are safe.
- There is no automatic queue; users must finish, pause, or discard the active generation.
- Session files are small enough to rewrite atomically, and only `data dir` is touched.
- A future queue or background worker can replace the global lock without changing the state machine
  or HTTP contracts.
