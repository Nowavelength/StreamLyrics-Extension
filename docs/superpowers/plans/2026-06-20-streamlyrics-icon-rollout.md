# StreamLyrics Icon Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every StreamLyrics brand asset with the approved circular, bright-red, fisheye lyric design.

**Architecture:** Keep `streamlyrics-icon.png` as the approved raster master because its organic fisheye typography cannot be reproduced faithfully with the earlier SVG approximation. Render the tracked PNG and ICO assets from that master, then let the existing Vite/CRXJS build copy the PNGs into `dist`.

**Tech Stack:** PNG, ImageMagick, Chrome Manifest V3, Vite/CRXJS

## Global Constraints

- Preserve the exact lines `YOUR MUSIC, IN SYNC`, `STREAM LYRICS`, and `EVERY WORD, RIGHT ON TIME`.
- Use a circular YouTube-red `#FF0000` background.
- Keep the middle line sharp, white, and dominant.
- Keep the upper and lower lines smaller, faded, and softly blurred.
- Apply a center-heavy fisheye treatment without adding symbols.
- Preserve the user's existing uncommitted `src/content/App.tsx` work.

---

### Task 1: Create the raster master

**Files:**
- Create: `streamlyrics-icon.png`
- Delete: the superseded vector master

- [x] Extract the approved generated circular lyric composition.
- [x] Remove the presentation background with a circular alpha mask.

### Task 2: Regenerate every raster brand asset

**Files:**
- Modify: `icons/icon16.png`
- Modify: `icons/icon48.png`
- Modify: `icons/icon128.png`
- Modify: `icon.ico`

- [x] Render PNGs at their exact declared dimensions.
- [x] Build the ICO with 16, 32, 48, 64, 128, and 256 pixel frames.
- [x] Inspect the 128px icon and a magnified 16px icon for visual integrity.

### Task 3: Rebuild and verify

**Files:**
- Generated: `dist/` (ignored)

- [x] Run `npm run build`.
- [x] Confirm the source and built PNG dimensions.
- [x] Confirm `dist/manifest.json` references the regenerated icon files.
- [x] Confirm no unrelated tracked files changed.
