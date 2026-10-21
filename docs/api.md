# Local API

The server binds to `127.0.0.1` and exposes JSON endpoints under `/api`. The Angular app is the
only intended client. Successful JSON responses use the shared envelope:

```json
{
  "data": {},
  "warnings": [],
  "requestId": "…"
}
```

`warnings` is present only when a library scan produced non-fatal reconciliation warnings. Errors use:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot pause while the session is draft.",
    "retryable": false,
    "details": {}
  }
}
```

Every response carries `x-request-id`. Non-local hosts/origins and mutations without the required
header use `403 FORBIDDEN`. API responses are `no-store`.

## Local request requirements

- The `Host` header must name `127.0.0.1` or `localhost` on the configured port. Non-local hosts are
  rejected for API and static requests.
- An `Origin` header, when present, must be a loopback origin. Development also accepts the Angular
  dev-server origin on port 4200; production accepts only the configured server origin.
- Every mutating API request (`POST`, `PUT`, `PATCH`, `DELETE`) must include
  `x-ccb-request: 1`. This is the app's CSRF defence; there is no CORS middleware and no automatic
  cross-origin preflight support.
- A rejected request returns `403` with `code: "FORBIDDEN"`.
- Responses carry a strict CSP with a per-process nonce. The same nonce is injected into the Angular
  app root (`<ccb-root ngCspNonce="…">`) so Angular runtime style tags are allowed. `eval` and
  inline scripts are blocked. KaTeX's generated style attributes are the documented
  `style-src-attr 'unsafe-inline'` exception.

Example mutation:

```bash
curl -X POST http://127.0.0.1:4310/api/subjects \
  -H 'content-type: application/json' \
  -H 'x-ccb-request: 1' \
  --data '{"name":"Computer Science"}'
```

## System

| Method | Route                   | Purpose                                                                                                                    |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/bootstrap`        | App version, library root/readiness, model, provider, and key configured/source. Never returns the key.                    |
| GET    | `/api/health`           | Process, library, and key readiness. Overall status is `degraded` when the library is unavailable or no key is configured. |
| GET    | `/api/library`          | Ordered subjects, courses, and scan warnings.                                                                              |
| POST   | `/api/subjects`         | Create a subject.                                                                                                          |
| PATCH  | `/api/subjects/:id`     | Rename a subject and repair course metadata.                                                                               |
| PUT    | `/api/subjects/order`   | Persist the full subject order.                                                                                            |
| DELETE | `/api/subjects/:id`     | Delete an empty subject, or cascade with typed confirmation.                                                               |
| GET    | `/api/courses/:id`      | Read a saved course: metadata, `outline.md`, and `course.md` exactly as stored.                                            |
| POST   | `/api/courses/:id/move` | Move a course to another subject.                                                                                          |
| DELETE | `/api/courses/:id`      | Delete a course after explicit confirmation.                                                                               |

`GET /api/courses/:id` returns:

```json
{
  "data": {
    "meta": {},
    "outlineMarkdown": "# …",
    "courseMarkdown": "# …"
  },
  "requestId": "…"
}
```

A course whose `course.md` or `outline.md` is missing returns `404 NOT_FOUND` with
`details.files`. Symlinked course files are rejected. The reader never writes to the library.

Library behavior and scan reconciliation are documented in the README.

## Sessions

### Lifecycle

```text
draft
  → generating_outline → outline_review → expanding → completed
                              ↑                │
                              └── regenerate ──┘ (only before expansion)

Any active stage:
  failure        → failed  (paused with an error, manual resume only)
  pause/stop     → paused
  server restart → paused  (reason: interrupted)
```

`failed` is "paused with an error": completed sections are preserved and only an explicit resume
continues. AI calls are never retried automatically.

### Routes

| Method | Route                                  | Success | Purpose                                                                                                                           |
| ------ | -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/sessions`                        | `201`   | Create a draft and return the exact starting prompt.                                                                              |
| PATCH  | `/api/sessions/:id/inputs`             | `200`   | Edit inputs and rebuild the preview. From `outline_review`, resets to `draft` and clears the outline, prompts, and section state. |
| GET    | `/api/sessions/:id`                    | `200`   | Full resumable snapshot.                                                                                                          |
| GET    | `/api/sessions?active=true`            | `200`   | In-progress sessions: drafts, reviews, running, paused, failed. Completed sessions are excluded.                                  |
| POST   | `/api/sessions/:id/outline`            | `202`   | Approval gate 1: generate the outline.                                                                                            |
| POST   | `/api/sessions/:id/regenerate-outline` | `202`   | Replace the outline before expansion, or after an outline failure.                                                                |
| POST   | `/api/sessions/:id/approve`            | `202`   | Approval gate 2: start section expansion.                                                                                         |
| POST   | `/api/sessions/:id/pause`              | `202`   | Finish the current section, then pause.                                                                                           |
| POST   | `/api/sessions/:id/stop`               | `202`   | Abort the current call, discard partial output, pause.                                                                            |
| POST   | `/api/sessions/:id/resume`             | `202`   | Manually resume a failed or paused session.                                                                                       |
| DELETE | `/api/sessions/:id`                    | `200`   | Stop and discard the session. Saved courses are not deleted.                                                                      |
| GET    | `/api/sessions/:id/events`             | `200`   | Server-sent event stream.                                                                                                         |

State rules:

- Only explicit actions advance approval gates.
- Expansion is accepted only from `outline_review`.
- Input edits are accepted only in `draft` or `outline_review`.
- Regeneration after expansion starts returns `409 EXPANSION_STARTED`.
- A second generation while one is running returns `409 GENERATION_BUSY` with
  `details.activeSessionId`.
- Starting or resuming outline/section work requires a configured key and an existing subject.
- A missing key returns `409 KEY_MISSING` without changing the session.

### Snapshots

A session snapshot contains:

- Input and prior-course context (`topic` and `audience` only).
- Exact starting and continuation prompts.
- Raw outline output and the parsed outline.
- Per-section status, generated Markdown, error, timestamps, and token usage.
- The reserved stable `courseId`, aggregate usage, and a relative `savedPath` after completion.

Completed sessions keep their snapshot; course files remain the permanent record. Drafts untouched
for 7 days are removed on startup.

## Server-sent events

Open `/api/sessions/:id/events` after creating or starting a session. Each connection receives an
authoritative `snapshot` event first. Reconnects also receive a fresh snapshot.

Events are named:

| Event               | Payload                                        |
| ------------------- | ---------------------------------------------- |
| `snapshot`          | Full session snapshot.                         |
| `status`            | Session summary after a state change.          |
| `outline_delta`     | Coalesced outline text.                        |
| `outline_ready`     | Parsed outline and exact continuation prompts. |
| `section_started`   | Section number and title.                      |
| `section_delta`     | Coalesced section text with section number.    |
| `section_completed` | Section number, Markdown, optional usage.      |
| `section_failed`    | Section number and structured error.           |
| `completed`         | Course id, relative saved path, and stats.     |

Deltas are coalesced to roughly 50 ms batches. Heartbeats are sent every 15 seconds. AI calls are
never retried by the transport; reconnecting only re-synchronizes state. Multiple tabs may watch the
same session.

## Wizard client behavior

The Angular wizard opens the SSE stream after loading a session. It treats each `snapshot` as
authoritative, applies semantic events immediately, and performs a short debounced session refresh
after them. Token deltas are coalesced again in the browser for rendering. Transport reconnects never
restart AI work.

`/courses/new/:sessionId/edit` is a client route for editing a draft or outline-review session.
`/courses/new/:sessionId` is a client redirect route that picks the correct step from status/stage.
