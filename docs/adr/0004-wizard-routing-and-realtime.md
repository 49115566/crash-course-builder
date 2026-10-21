# ADR 0004: Wizard routing, live reconciliation, and the deferred reader link

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The creation wizard spans four screens and multiple asynchronous AI calls. Refresh, browser back,
navigation away, multiple tabs, server restarts, and transport reconnects must not lose work or show
misleading state. The phase plan lists four routes, but editing a draft after refresh also needs a
stable URL.

The reader does not exist until Milestone 5, while the wizard's completion state is part of Milestone 4.

## Decision

- Add `/courses/new/:sessionId/edit` for refresh-safe input editing, and
  `/courses/new/:sessionId` as a redirect route that selects the correct step from status/stage.
- Provide one `SessionWizardStore` at the wizard layout level. It owns the authoritative session,
  connection state, buffered live text, and actions. It is disposed when the layout is destroyed.
- Treat every SSE `snapshot` as authoritative. Apply named events optimistically, then reconcile the
  session with a short debounce. Preserve live text only while the same section/stage is still
  active. Ignore stale reconcile responses using a request sequence token.
- Keep the reviewed outline reachable read-only after expansion starts so the disabled-regeneration
  explanation is explicit. The normal approval flow still navigates to `/write`.
- Defer the “Read course” action to Milestone 5 rather than rendering a dead link. The Milestone 4
  success state shows the saved path, statistics, and a library action.
- Expose fake-provider delay/failure controls only through `CCB_FAKE_AI_*` when `CCB_AI_PROVIDER=fake`
  so browser tests can exercise streaming and recovery deterministically. The DeepSeek provider is
  unchanged.

## Consequences

- Wizard URLs are durable and resumable; a draft can be edited without in-memory navigation state.
- Multiple tabs converge through snapshots and reconcile reads, while single-token rendering stays
  cheap and calm.
- The read-only outline adds a small amount of routing logic but makes an important safety rule
  visible instead of silently hiding it.
- The complete create-to-save flow is testable in isolation from the reader.
