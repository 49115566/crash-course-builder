# Crash Course Builder

A private, local-first Angular and Node application for building and reading short AI-generated
crash courses. Courses are stored as readable Markdown files inside a folder library on your own
computer.

## Current status

Milestone 0 (Foundation) is implemented:

- npm workspace with shared contracts, Angular web app, and Node/Express server.
- Strict TypeScript, ESLint, Prettier, Vitest, and Playwright setup.
- Local configuration loader, redacting structured logging, API error envelope, request IDs, and a
  health endpoint.
- Design tokens, self-hosted fonts, accessible app shell, and shared UI primitives.
- Development proxy and production-style local static serving.
- Unit, API integration, and browser smoke tests.

The course library, AI generation workflow, wizard, reader, and key-management CLI arrive in later
milestones. No AI key is required yet.

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

## Scripts

| Command                 | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`           | Run contracts, server, and web watchers                                         |
| `npm run build`         | Build contracts, web, and server in order                                       |
| `npm start`             | Serve the production build from loopback                                        |
| `npm run verify`        | Format check, lint, contract validation, typecheck, tests, and production build |
| `npm test`              | Run contracts, server, and Angular unit tests                                   |
| `npm run test:coverage` | Run tests with coverage reporting                                               |
| `npm run e2e`           | Build and run the Playwright smoke suite                                        |
| `npm run e2e:install`   | Install the Chromium browser used by Playwright                                 |
| `npm run format`        | Format the repository                                                           |
| `npm run clean`         | Remove build and test output                                                    |

Run the browser suite once with:

```bash
npm run e2e:install
npm run e2e
```

## Configuration

Configuration is read from environment variables. No `.env` file is loaded automatically.

| Variable                | Default                       | Purpose                                                         |
| ----------------------- | ----------------------------- | --------------------------------------------------------------- |
| `CCB_PORT`              | `4310`                        | Local server port                                               |
| `CCB_LIBRARY_ROOT`      | `~/CrashCourses`              | Course library root                                             |
| `CCB_DATA_DIR`          | OS application data directory | Session and application data                                    |
| `CCB_CONFIG_DIR`        | OS configuration directory    | Configuration fallback                                          |
| `CCB_MODEL`             | `deepseek-chat`               | AI model name                                                   |
| `CCB_DEEPSEEK_BASE_URL` | `https://api.deepseek.com`    | DeepSeek API base URL                                           |
| `CCB_LOG_LEVEL`         | `info`                        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `CCB_WEB_DIST`          | `apps/web/dist/web/browser`   | Optional web build override                                     |

The library and data directories are not created in Milestone 0.

## Project layout

```text
apps/web/          Angular application
apps/server/       Express API and static file server
packages/contracts Shared Zod schemas, DTOs, error codes, and constants
e2e/               Playwright specs
```

The build order is contracts → web → server. Angular and Node consume the built contracts package.

## Privacy and security baseline

- No analytics or telemetry.
- Fonts are self-hosted through Fontsource; the app makes no external requests in Foundation.
- The server binds `127.0.0.1` only.
- Structured logs redact authorization headers, cookies, API-key fields, and secret fields.
- API responses use `Cache-Control: no-store`; hashed static assets are cached immutably.
- Baseline security headers are enabled. CSP nonce injection, origin/CSRF enforcement, and the
  full hardening pass are scheduled for Milestone 6.
- Secrets are never returned by the health endpoint.

## Troubleshooting

- **`Unsupported engine` during install:** use Node 24.15+ or Node 26+.
- **Port already in use:** stop the other process or set `CCB_PORT`.
- **“Local service unavailable” in the footer:** the browser loaded but the Node service is not
  running. Start `npm run dev` or `npm start`.
- **Playwright cannot find Chromium:** run `npm run e2e:install`.
- **Angular dev server shows an API error:** confirm the server is listening on port 4310.
