# KWin PiP Keep-Above Hardening Design

## Goal

Keep StreamLyrics' Chrome Document Picture-in-Picture window above other
windows on this KDE Plasma 6 Wayland system.

## Confirmed context

- StreamLyrics already uses native `documentPictureInPicture.requestWindow`.
- Chrome documents Document PiP as an always-on-top window, but Wayland/KWin
  controls final native stacking.
- This machine is KDE Plasma 6 on Wayland.
- The local StreamLyrics KWin script is installed, enabled, and reported as
  loaded by KWin.
- The remaining failure is therefore in KWin-side matching or reapplication,
  not in the extension's pop-out API.

## Approach

Harden the existing user-local KWin script instead of replacing Document PiP or
adding a normal popup fallback.

The script will:

- keep watching existing windows and future `workspace.windowAdded` windows;
- match only likely StreamLyrics PiP windows by caption and bounded geometry;
- support both direct `width`/`height` properties and `frameGeometry`-based
  geometry;
- connect only to signals that exist on the current KWin window object;
- reapply `keepAbove = true` periodically because KWin or Chrome may later
  change the native window state;
- avoid touching ordinary Chrome windows that do not include `StreamLyrics` in
  their title.

## Verification

- Add a Node-based source/runtime test for the KWin helper using a fake KWin
  workspace and fake window signals.
- Verify the test fails against the current helper before implementation.
- Verify the test passes after hardening.
- Run `npm run build`.
- Reinstall and reload the KWin helper for the current user.
- With a StreamLyrics PiP open, use the KWin check script to report whether a
  matching window has `keepAbove=true`.

## Non-goals

- Using `window.open()` as a fallback.
- Requiring sudo or changing system-wide KWin files.
- Applying keep-above to every Chrome or browser window.
- Changing lyrics sync, layout, storage, or extension permissions.
