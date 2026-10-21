# Manual QA checklist

Record the date, OS, browser version, and any deviation. Automated coverage is in Playwright; this
checklist covers things that still benefit from human inspection.

## Release smoke

- [ ] `npm ci && npm run build && npm start` serves the app at `http://127.0.0.1:4310`.
- [ ] `npm start -- --no-open` does not open a browser.
- [ ] The browser opens automatically for plain `npm start`.
- [ ] `npm start` with no web build prints an actionable `npm run build` instruction and exits non-zero.
- [ ] `npm run smoke` completes a fake-AI course and exits zero.
- [ ] `npm run doctor` passes with a valid key and reports the web build and directory permissions.
- [ ] `SIGINT`/`SIGTERM` during generation leaves the session paused/interrupted and resumable.

## Browsers and responsive layout

- [ ] Chromium, Firefox, and WebKit complete the library, wizard, failure/resume, and reader flows.
- [ ] Library, wizard, generation, and reader are usable at 320 px, 390 px, 768 px, and desktop width.
- [ ] Browser zoom at 200% does not clip controls, hide content, or force horizontal scrolling at
      normal reading widths.
- [ ] Print preview contains the course document and hides app chrome.
- [ ] `prefers-reduced-motion` removes non-essential motion; skeletons and live indicators still convey
      status through text.

## Keyboard and screen reader

- [ ] Skip link is first, visible on focus, and moves focus to `<main>`.
- [ ] Every button, link, menu, dialog, combobox, and drag alternative is reachable by keyboard.
- [ ] Dialogs trap focus, close with Escape, and restore focus to their trigger.
- [ ] Subject reordering is possible from the subject menu without dragging.
- [ ] Reader contents drawer and "In this course" links move focus and scroll to the section.
- [ ] Screen reader announces page titles on navigation, section boundaries during generation, and
      completion, without announcing every token.
- [ ] Status is understandable without color; axe reports no violations in the main flows.

## Security and privacy

- [ ] CSP console has no violations in all three browsers.
- [ ] A mutation without `x-ccb-request: 1` returns `403 FORBIDDEN`.
- [ ] A non-local `Host`/`Origin` is rejected.
- [ ] No requests leave the app origin except the configured DeepSeek endpoint during real generation.
- [ ] Saved courses render raw HTML/remote images inert and unsafe links removed.
- [ ] The API key is never visible in the UI, logs, session JSON, or API responses.

## Filesystem

- [ ] Saving a course writes `course.md`, `outline.md`, and `meta.json` in the chosen subject folder.
- [ ] Manually renaming a subject/course folder is repaired on the next scan without data loss.
- [ ] Manually moving a course folder repairs its subject metadata.
- [ ] Corrupt metadata produces a warning and is left untouched.
- [ ] Backup by copying the library root restores all courses on another machine.

## Key and recovery paths

- [ ] Missing key shows a persistent banner and disables generation.
- [ ] `npm run key:set` validates and stores the key; `key:status` never prints it.
- [ ] Keychain fallback file has `0600` permissions when used.
- [ ] A failed AI call shows "Paused — needs attention" and only resumes manually.
- [ ] A second course started during generation shows `GENERATION_BUSY` and links to the active session.
- [ ] Discarding a draft removes its session without deleting saved courses.
