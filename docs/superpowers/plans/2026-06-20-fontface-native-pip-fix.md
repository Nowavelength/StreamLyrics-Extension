# FontFace and Native PiP Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Manrope load through each document's FontFaceSet and restrict Pop Out to native always-on-top Document Picture-in-Picture.

**Architecture:** Replace injected `@font-face` CSS with a shared `loadManropeFont(targetDocument)` helper that registers one `FontFace` per document and caches its promise in a WeakMap. Call it for the owner page, options page, and PiP document. Remove `window.open()` fallback logic so every successful pop-out is native Document PiP.

**Tech Stack:** React 18, TypeScript, browser FontFace API, Document Picture-in-Picture API, Vite/CRXJS.

## Global Constraints

- Keep the bundled Manrope WOFF2 and system fallback stacks.
- Do not add runtime font network requests.
- Do not provide a normal popup fallback.
- Preserve existing PiP portal, sizing, title, favicon, and stylesheet behavior.
- Do not change panel layouts, lyric synchronization, or font sizes.

---

### Task 1: Add regression checks

**Files:**
- Modify: `scripts/verify-manrope.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run verify:font` checks FontFace registration and PiP-only source behavior.

- [ ] Add checks requiring `new FontFace`, `targetDocument.fonts.add`, `loadManropeFont(document)` in content/options, and `loadManropeFont(pipWin.document)` in App.
- [ ] Add checks requiring `documentPictureInPicture.requestWindow` and rejecting `window.open(` in `App.tsx`.
- [ ] Run `npm run verify:font`; expect failure because the old CSS injection and popup fallback remain.

### Task 2: Register Manrope in each document

**Files:**
- Modify: `src/shared/manropeFont.ts`
- Modify: `src/content/index.tsx`
- Modify: `src/popup/popup.js`
- Modify: `src/content/App.tsx`

**Interfaces:**
- Produces: `loadManropeFont(targetDocument: Document): Promise<void>`.

- [ ] Replace `MANROPE_FONT_FACE` and `withManropeFontFace` with a WeakMap-cached FontFace loader using family `Manrope`, weight `200 800`, style `normal`, and the bundled WOFF2 URL.
- [ ] Start loading in `src/content/index.tsx` before mounting, without blocking panel injection.
- [ ] Start loading in `src/popup/popup.js`.
- [ ] Await loading in the native PiP document before finalizing its presentation.

### Task 3: Enforce native always-on-top PiP

**Files:**
- Modify: `src/content/App.tsx`

**Interfaces:**
- Consumes: `window.documentPictureInPicture.requestWindow`.
- Produces: native Document PiP window or a user-visible error.

- [ ] Restore the unsupported-browser guard with a Chrome 116+ message.
- [ ] Request the native PiP window in one try/catch.
- [ ] Remove all `window.open()` fallback code.
- [ ] On request rejection, log the original error and alert that an always-on-top window could not open.
- [ ] Preserve the existing document styling, title, favicon, stylesheet, portal state, and close handling.

### Task 4: Verify and commit

**Files:**
- Verify all modified files.

- [ ] Run `npm run build`.
- [ ] Run `npm run verify:font`.
- [ ] Run `git diff --check`.
- [ ] Confirm `rg -n "window\\.open\\(" src/content/App.tsx` returns no matches.
- [ ] Commit only the corrective implementation files.
