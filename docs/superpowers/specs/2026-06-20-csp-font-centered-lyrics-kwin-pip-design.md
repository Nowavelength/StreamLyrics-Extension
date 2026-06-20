# CSP-Proof Font, Centered Lyrics, and KWin PiP Design

## Goal

Make Manrope visibly render on YouTube and YouTube Music, center full-mode
lyrics horizontally, and keep StreamLyrics' native Document PiP above other
windows on the user's Fedora KDE Wayland desktop.

## Confirmed root causes

### Manrope

The bundled WOFF2 is currently emitted as a data URL and passed to
`new FontFace('Manrope', "url(...)")`. YouTube's restrictive `font-src`
Content Security Policy treats that as a font network source and rejects it
with `NetworkError`.

A Chromium reproduction with `font-src 'none'` confirmed:

- URL-backed `FontFace`: rejected.
- The same font supplied as an `ArrayBuffer`: loaded successfully.

### Lyric alignment

Full-mode lyric lines are explicitly styled with `text-align: left` in
`panel.css`. Mini and ultra modes use separate layouts and are already
centered appropriately.

### Always-on-top

The extension uses native Document Picture-in-Picture. Chrome documents that
API as always-on-top, but the operating-system compositor controls the final
stacking state. On this machine KWin 6.6.5 is running in Wayland mode, so web
code cannot set the native window's `keepAbove` property.

## Font design

- Import the WOFF2 as a base64 string at build time.
- Decode base64 into an `ArrayBuffer` in extension JavaScript.
- Construct `FontFace` from the binary buffer, not from a URL.
- Cache the decoded bytes once and continue caching one load promise per
  document.
- Register Manrope in the owner page, options page, and PiP document.
- Keep system font fallbacks if loading fails.

This avoids host-page `font-src` restrictions because no font URL is resolved.

## Lyric alignment design

- Change `.lyric-line` to `text-align: center`.
- Keep the existing full-mode scroll container, line sizing, active scaling,
  click-to-seek behavior, and auto-scroll behavior.
- Do not alter metadata, header, mini-mode, or ultra-mode text alignment.

## KWin integration design

- Add a small KWin 6 script package under `platform/linux/kwin/`.
- The script observes existing windows plus `workspace.windowAdded`.
- It identifies a candidate only when all of these are true:
  - the window belongs to Chrome;
  - its caption contains `StreamLyrics`;
  - its size is within the expected PiP range rather than a normal browser
    window.
- It re-evaluates on caption and geometry changes because Chrome may create
  the native window before StreamLyrics sets its final title.
- Matching windows get `keepAbove = true`; ordinary Chrome, YouTube Music,
  VS Code, and other windows are untouched.
- Include an installer script that copies the KWin package into the current
  user's `~/.local/share/kwin/scripts/`, enables it in `kwinrc`, and asks KWin
  to reconfigure. No administrator password is needed.

## Verification

- A Chromium CSP regression test must prove binary-backed Manrope loads under
  `font-src 'none'`.
- The source verifier must reject URL-backed `FontFace` construction.
- The CSS verifier must require centered `.lyric-line` text.
- The KWin helper must pass syntax/source checks and be installed for the
  current user.
- With a StreamLyrics PiP open, a KWin probe must report `keepAbove: true`.
- `npm run build` and all repository verification commands must pass.

## Non-goals

- Changing lyric vertical positioning or scroll timing.
- Applying keep-above to every Chrome window.
- Replacing native Document PiP with a normal popup.
- Requiring root privileges or changing system-wide KWin files.
