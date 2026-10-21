# ADR 0006: Local service request security

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The production app is a browser UI served by a local Node process. Although it binds to loopback, a
malicious web page in the same browser can still attempt DNS-rebinding or cross-site form/fetch
requests unless the server validates where requests come from. The reader also needs a strict CSP
that permits Angular runtime styles and KaTeX output without allowing inline scripts or `eval`.

## Decision

- Bind only to `127.0.0.1`.
- Require `Host` to be `127.0.0.1` or `localhost` on the configured port.
- When `Origin` is present, require a loopback origin. Development also accepts the Angular
  dev-server origins on port 4200; production accepts only the configured server origin.
- Require `x-ccb-request: 1` on every mutating API request. No CORS middleware is installed, so a
  cross-origin page cannot obtain permission to send this header.
- Add a shared `FORBIDDEN` error code mapped to HTTP 403.
- Send a strict CSP on every response:
  - `script-src 'self'`, no inline scripts, no `unsafe-eval`
  - `style-src 'self' 'nonce-<per-process>'`
  - `style-src-attr 'unsafe-inline'` only for Angular style bindings and KaTeX-generated attributes
  - `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`
  - `frame-ancestors 'none'`, `object-src 'none'`
- Disable Angular critical-CSS inlining in production, then inject the nonce into the CSP header and
  `<ccb-root ngCspNonce="…">` when rendering the index. Angular uses the attribute for its runtime
  style tags.
- Configure Zod's browser `jitless` mode before any schema runs. This avoids Zod's CSP probe that
  intentionally throws `new Function` and is reported as a CSP violation by Firefox even when caught.

## Consequences

- Cross-site browser requests, DNS rebinding, and cross-origin mutations are rejected.
- Hand-written API calls need the CSRF header; this is documented in `docs/api.md`.
- KaTeX inline style attributes are the one deliberate weakening. Untrusted Markdown style
  attributes are stripped before rendering, and KaTeX runs with `trust: false`, bounded expansion,
  and ignored code/script tags.
- The production build serves one external stylesheet instead of inline critical CSS. On a local
  server this trade-off is small and keeps the CSP simple and verifiable.
- Security headers, host/origin rejection, mutation rejection, and CSP behavior are covered by unit,
  integration, and cross-browser E2E tests.
