# ADR 0007: Production startup and release smoke

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The development workflow starts the API and Angular dev server separately. A release run must serve
the compiled UI and API from one loopback process, fail early with actionable errors when build output
is missing, open the browser by default, shut down gracefully, and be testable without touching the
developer's real library.

## Decision

- Add `scripts/start.mjs` as the canonical `npm start` entry point.
  - Set `NODE_ENV=production`.
  - Verify the compiled server exists.
  - Spawn the server with `--require-web-build` and `--open` unless `--no-open` is supplied.
  - Forward `SIGINT`/`SIGTERM` and propagate the child exit code.
- The server verifies the Angular `index.html` exists when `--require-web-build` is set. Missing
  builds produce a specific `npm run build` instruction and a non-zero exit.
- Browser launch uses the platform opener after the server is listening. `--no-open`,
  `CCB_NO_OPEN=1`, `CI`, and `NODE_ENV=test` suppress it. Open failures are warnings, not startup
  failures.
- Add `npm run smoke`: an isolated temporary library/data/config, fake AI provider, random loopback
  port, health/index/CSP checks, a complete course workflow, graceful shutdown, and restart
  recovery. It uses the real production start path.
- Add `npm run check:size` after the production build. It parses the built index, gzips the actual
  initial asset graph, and enforces the 350 KiB gzip budget.
- Keep `npm run verify` deterministic and fast: format, lint, contracts, typecheck, coverage, build,
  and size gate. Cross-browser E2E and smoke remain separate release commands.

## Consequences

- `npm start` is a stable one-command release path with clear errors.
- The release smoke exercises production serving, security headers, fake generation, shutdown, and
  restart recovery without real secrets or network access.
- CI can run `verify`, all three Playwright browsers, and smoke with `CI=1`/`CCB_NO_OPEN=1`.
- Developers who run the server workspace script directly bypass the wrapper and browser opening;
  the root `npm start` is the documented production command.
