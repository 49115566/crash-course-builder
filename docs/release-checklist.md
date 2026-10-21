# Release checklist

## Before tagging

- [ ] Node version satisfies `^24.15 || >=26`; npm is 11+.
- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run verify` passes, including coverage thresholds and the 350 KiB gzip bundle gate.
- [ ] `npm run e2e` passes in Chromium, Firefox, and WebKit.
- [ ] `npm run smoke` passes against the production build.
- [ ] `npm run doctor` passes with a real key and reports the web build as present.
- [ ] Manual QA checklist reviewed and recorded.
- [ ] No secrets, library contents, `.tmp/`, coverage, or test output are staged.

## Packaging

- [ ] `npm run build` produces `packages/contracts/dist`, `apps/server/dist`, and
      `apps/web/dist/web/browser/index.html`.
- [ ] The initial gzip graph is below 350 KiB.
- [ ] KaTeX CSS/fonts live under `vendor/katex/` and the reader loads them lazily.
- [ ] `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/prompts.md`, and ADRs match behavior.
- [ ] Version bumped if this is a tagged release.

## Deployment

- [ ] `npm ci && npm run build && npm start` serves the app and opens the browser.
- [ ] `npm start -- --no-open` works for headless/service use.
- [ ] A missing build produces an actionable error.
- [ ] Shutdown converts active sessions to resumable paused sessions.
- [ ] Backup and uninstall instructions are accurate.

## Rollback

- [ ] Keep a copy of the previous build and library root.
- [ ] Courses are ordinary folders; restore by copying the library root back.
- [ ] Session snapshots are optional and can be discarded if the data directory is reset.
