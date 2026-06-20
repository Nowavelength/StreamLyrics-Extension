# FontFace and Native PiP Fix Design

## Goal

Make the bundled Manrope font visibly render in every StreamLyrics surface and
ensure the Pop Out action creates only a genuinely always-on-top window.

## Root causes

- Chromium accepts a family name selected inside Shadow DOM CSS but does not
  expose the nested `@font-face` through the owning document's font set. The
  panel therefore falls back to a system font even though computed CSS still
  says `Manrope`.
- The current uncommitted `App.tsx` change catches unavailable or rejected
  Document Picture-in-Picture requests and opens a normal `window.open()`
  popup. A normal browser popup cannot request operating-system always-on-top
  behavior.

## Font design

- Keep the locally bundled Manrope WOFF2 and existing `font-family` stacks.
- Replace CSS `@font-face` string injection with a shared
  `loadManropeFont(document)` helper built on the browser `FontFace` API.
- Register the loaded face in each relevant document's `document.fonts`:
  the YouTube owner document before mounting the Shadow DOM, the options
  document, and the native Document PiP document after it opens.
- Deduplicate loading per document with a `WeakMap<Document, Promise<void>>`.
- A failed font load must log a warning and leave the existing system fallback
  stack usable.

## Pop-out design

- Use only `window.documentPictureInPicture.requestWindow`.
- Do not call `window.open()` as a fallback.
- If Document PiP is unavailable, explain that Chrome 116+ is required.
- If the native request is rejected, log the original error and show a clear
  message that an always-on-top window could not be opened.
- Preserve the existing PiP portal, sizing, title, favicon, and stylesheet
  injection behavior after a native PiP window opens.

## Verification

- A source regression check must require `FontFace`, `document.fonts.add`, and
  loading Manrope into owner, options, and PiP documents.
- The check must reject any `window.open()` call in `App.tsx`.
- The check must require `documentPictureInPicture.requestWindow`.
- The production build and existing Manrope verification must pass.

## Non-goals

- Providing a non-always-on-top fallback window.
- Adding a desktop companion process or operating-system window manager rules.
- Changing panel layout, lyrics synchronization, or typography sizing.
