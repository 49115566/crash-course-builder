# ADR 0003: Secret storage precedence

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The app is local-first and needs a DeepSeek key without a settings UI in Phase 1. Keychains are not
available in every environment, but leaving the key only in an environment variable makes normal
desktop use awkward.

## Decision

Resolve the key in this order:

1. `DEEPSEEK_API_KEY`
2. OS keychain (`@napi-rs/keyring`)
3. `<CCB_CONFIG_DIR>/credentials.json` with `0600` permissions

The CLI validates a key through `GET /models` before saving it. Keychain failures fall back with a
warning. The key is never logged, returned by the API, or stored in session/course metadata.

## Consequences

- Normal desktop installs can use the keychain.
- Headless Linux and CI can use the environment or a private fallback file.
- The fallback file is plaintext on disk; owner-only permissions reduce accidental exposure but are
  not equivalent to a keychain.
- The provider reads the secret lazily, so a new generation picks up keychain/file changes. Environment
  changes still require restarting the server process.
