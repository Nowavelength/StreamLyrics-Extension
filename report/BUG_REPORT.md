# StreamLyrics — Codebase Bug & Issue Report

**Project:** StreamLyrics Chrome Extension (v1.0.0)
**Stack:** React 18 + TypeScript + Vite + CRXJS, Manifest V3
**Audited:** 2026-05-28
**Total issues found:** 50+ across 6 severity tiers

---

## 📑 Table of Contents

1. [Executive Summary](#-executive-summary)
2. [Severity Legend](#-severity-legend)
3. [🔴 Critical Bugs (App-breaking)](#-critical-bugs-app-breaking)
4. [🟠 High-Severity Bugs (Functional)](#-high-severity-bugs-functional)
5. [🟡 Medium-Severity Bugs (Behavioral)](#-medium-severity-bugs-behavioral)
6. [🟢 Low-Severity / Code Quality](#-low-severity--code-quality)
7. [⚡ Performance Issues](#-performance-issues)
8. [🔒 Security & Privacy Concerns](#-security--privacy-concerns)
9. [💀 Dead Code & Cleanup](#-dead-code--cleanup)
10. [📦 Repository Hygiene](#-repository-hygiene)
11. [✅ Suggested Fix Order](#-suggested-fix-order)

---

## 📋 Executive Summary

StreamLyrics is a polished and ambitious Chrome extension, but the codebase has accumulated several **critical bugs**, **dead code**, **performance footguns**, and **repo hygiene problems**.

**Top priorities to fix:**

| # | Issue | Why it matters |
|---|---|---|
| 1 | Settings popup (`popup.html`) is **completely unreachable** | Manifest is missing `default_popup`. Users can never change settings. |
| 2 | Service worker promises to **inject** content script on click but doesn't | Clicking the icon on a fresh page silently does nothing. |
| 3 | Settings updates from popup never reach **YouTube Music** tabs | `chrome.tabs.query` filters only `youtube.com`, missing `music.youtube.com`. |
| 4 | Suspicious **`https://test-0k.onrender.com/*`** host permission | Looks like a personal/test backend. Code that uses it is dead. |
| 5 | 78 MB MP4 + zip + android build artifacts checked into git | Bloats clones, slows everything. |
| 6 | `~50 MB` of unused dependencies (`tailwindcss`, `colorthief`, `sharp`, etc.) | Slows installs, confuses readers. |

---

## 🎚 Severity Legend

| Icon | Severity | Meaning |
|---|---|---|
| 🔴 | **Critical** | Breaks core functionality or has security impact. |
| 🟠 | **High** | Wrong behavior under common conditions. |
| 🟡 | **Medium** | Edge cases, UX issues, incorrect outputs in some flows. |
| 🟢 | **Low** | Code smells, style, minor issues. |
| ⚡ | **Perf** | Performance / resource consumption. |
| 🔒 | **Security** | Permission scope, data leakage, attack surface. |

---

## 🔴 Critical Bugs (App-breaking)

### 🔴 C1. Settings popup is completely unreachable

**File:** `manifest.json`

The `action` block does NOT define `default_popup`, so clicking the extension icon goes to the `chrome.action.onClicked` listener (which only toggles the panel). The whole `src/popup/` directory (`popup.html`, `popup.js`, `popup.css`) is **orphaned** — users cannot adjust panel width, font size, or the enabled toggle.

```json
"action": {
    "default_icon": { ... },
    "default_title": "Toggle StreamLyrics Panel"
    // ❌ Missing: "default_popup": "src/popup/popup.html"
}
```

**Impact:** All settings UI is dead code. The `chrome.runtime.sendMessage({type: 'SETTINGS_UPDATED'})` flow can never be triggered.

**Fix:** Either add `"default_popup"` and rework click handling, or delete the entire `src/popup/` folder.

---

### 🔴 C2. Service worker says “injecting…” but never actually injects

**File:** `src/background/service-worker.ts:13-21`

```ts
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    } catch (error) {
        console.log('Content script not ready, injecting...'); // ❌ Lies — does NOT inject
    }
});
```

If a YouTube tab was opened **before** the extension was installed/enabled, the content script is not running. On click, `sendMessage` rejects, the message is logged, and **nothing else happens**. The user has to manually reload the page.

**Bonus problem:** Even if you wanted to inject here, the manifest does not declare the `"scripting"` permission, so `chrome.scripting.executeScript` would fail anyway.

**Fix:** Either add the `"scripting"` permission and call `chrome.scripting.executeScript({...})` in the catch, or change the message to be honest: `"Tab needs to be reloaded for StreamLyrics to activate."`

---

### 🔴 C3. Popup queries only `youtube.com`, ignores `music.youtube.com`

**File:** `src/popup/popup.js:33,57`

```js
const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
```

Same query is repeated twice. Since the extension targets YouTube Music as its primary surface, **settings changes never propagate to YT Music tabs in real time**.

**Fix:**
```js
const tabs = await chrome.tabs.query({
  url: ['https://www.youtube.com/*', 'https://music.youtube.com/*']
});
```
(This is moot until C1 is fixed, but it’s still a real bug.)

---

### 🔴 C4. `if (result.offset)` excludes the valid value `0`

**File:** `src/content/hooks/useTranscript.ts` (multiple spots)

```ts
if (partial.offset) {
    setInitialOffset(partial.offset);
}
// ...
if (result.offset) {
    setInitialOffset(result.offset);
}
```

A valid offset of `0` (most common!) is treated as falsy and skipped. The previous track’s offset bleeds into the new track.

**Fix:** `if (typeof result.offset === 'number')` or `if (result.offset !== undefined)`.

---

### 🔴 C5. `parseLrcFormat` silently drops multi-timestamp LRC lines

**File:** `src/content/utils/transcriptParser.ts:79-89`

```ts
const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.+)/g;
```

LRC spec allows multiple timestamps per line: `[00:01.00][00:05.00]Same lyric`. The regex only captures the first timestamp; the second (and any associated text) is lost. Songs with repeating choruses tagged this way will have missing lines.

**Fix:** Pre-split each line by `]` and emit a `LyricLine` for each timestamp.

---

## 🟠 High-Severity Bugs (Functional)

### 🟠 H1. Memory leak — `urlObserver` MutationObserver never disconnected

**File:** `src/content/index.tsx:670-683`

```ts
const urlObserver = new MutationObserver(() => { /* ... */ });
urlObserver.observe(document.body, { childList: true, subtree: true });
// ❌ Never .disconnect()ed
```

Lives forever for the page lifetime, observing every mutation in the body subtree. On YouTube Music (which mutates the DOM constantly), this is a CPU drain.

**Fix:** Disconnect when the panel is fully unmounted, or at least throttle.

---

### 🟠 H2. `waitForPlayer()` polls every 500 ms forever

**File:** `src/content/index.tsx:43-58`

```ts
const waitForPlayer = () => {
    const player = document.querySelector('#movie_player') /* ... */;
    if (!player) {
        setTimeout(waitForPlayer, 500); // ❌ infinite, no max retry, no exit
        return;
    }
    injectApp(initialVisible);
};
```

If a YouTube page never gets a player element (e.g., channel pages, search results, errors), this polls **forever** at 2 Hz.

**Fix:** Cap retries (e.g., 60 = 30s) and bail out gracefully.

---

### 🟠 H3. AudioContext leak — graph held for life of `<video>` element

**File:** `src/content/hooks/useAudioBars.ts:7-11, 99-104`

```ts
const audioGraphCache = new WeakMap<HTMLMediaElement, {...}>();
// ...
return () => {
    isActive = false;
    cancelAnimationFrame(rafId);
    if (cleanupListener) cleanupListener();
    // WE DO NOT DISCONNECT THE AUDIO GRAPH HERE.
};
```

Browsers cap concurrent active `AudioContext` instances at ~6. YouTube reuses video elements between SPA navigations and PIP, but the cache binding lives for as long as the element does. After many navigations, the user can hit the limit and other audio code (or even the video itself) breaks.

Also, `MediaElementAudioSourceNode` once created on a media element is **non-reusable** — you cannot create a second one for the same element, even from a fresh AudioContext. Adding more cautious lifecycle handling here is essential.

**Fix:** Track contexts globally; close older contexts when a new one is created or when the panel is disabled.

---

### 🟠 H4. Setting state every animation frame causes ~60 renders/second

**File:** `src/content/hooks/useAudioBars.ts:64,89`

```ts
setBars([...barsRef.current]);
// inside requestAnimationFrame loop, runs ~60 fps
```

This triggers a React reconcile + commit ~60 times per second, even when the panel is hidden. Combined with the same pattern in `Panel.tsx` (smoothing dimensions) and the `useVideoSync` RAF loop, you can easily hit 180+ React renders per second.

**Fix:** Use refs + direct DOM `style.height` writes, or throttle to 30 fps (`if (frame % 2 === 0)`).

---

### 🟠 H5. Smoothing RAF in `Panel.tsx` never stops

**File:** `src/content/components/Panel.tsx:172-189`

```ts
const step = () => {
    setSmoothWidth((prev) => {
        const diff = activeWidth - prev;
        if (Math.abs(diff) < 0.1) return activeWidth;
        return prev + diff * 0.1;
    });
    // ...
    rafId = requestAnimationFrame(step); // ❌ keeps requesting even when settled
};
```

Even when both width and height have settled, the loop keeps scheduling itself. Constant CPU draw with nothing to compute.

**Fix:** Inside `step`, if both deltas are below threshold, skip the next `requestAnimationFrame`.

---

### 🟠 H6. `handleExpand` discards the user’s previous panel size

**File:** `src/content/components/Panel.tsx:227-236`

```ts
const handleExpand = useCallback(() => {
    setPanelWidth(380);
    setPanelHeight(500);
    setPlayerMode('full');
    // ...
}, [...]);
```

If the user had set the panel to 600×700 and then dragged it down to mini mode, clicking expand resets to a fixed 380×500. Their custom size is gone.

**Fix:** Remember `lastFullWidth`/`lastFullHeight` in a ref before entering mini/ultra; restore those values on expand.

---

### 🟠 H7. Only `panelWidth` is persisted; height + position are lost on reload

**File:** `src/content/components/Panel.tsx:312-318`

```ts
const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(null);
    if (playerMode === 'full' && typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set({ panelWidth: panelWidth }); // ❌ only width
    }
};
```

`panelHeight`, `panelX`, `panelY`, and `playerMode` are NOT persisted. Every page reload resets everything except width.

**Fix:** Persist all four (and mode) inside `chrome.storage.local`. README claims this is already done — it isn’t.

---

### 🟠 H8. Default panel-X assumes a 400 px width that doesn’t exist

**File:** `src/content/components/Panel.tsx:130-133`

```ts
const [panelWidth, setPanelWidth] = useState(settings?.panelWidth ?? 380);
const [panelX, setPanelX] = useState(window.innerWidth - 400); // ❌ hardcoded 400
```

If the user has a customized `panelWidth` of 600, the panel is initialized 200 px off-screen on the right. Also `panelWidth` defaults to 380, but `popup.js` initializes Chrome storage with 400 — small inconsistency.

**Fix:** Use `window.innerWidth - panelWidth - 20`.

---

### 🟠 H9. `extractDominantColor` does not actually find the dominant color

**File:** `src/content/utils/colorExtractor.ts:46-78`

The function name claims "dominant color" but the algorithm just **averages RGB values** of mid-brightness pixels:

```ts
r += pr; g += pg; b += pb; count++;
return { r: r/count, g: g/count, b: b/count };
```

Average colors are perceptually muddy and unrepresentative. Result: every dark album art gives roughly the same brownish tint.

**Fix:** Use the bundled `colorthief` library that is already in `package.json` (and currently unused), or implement k-means / median-cut.

---

### 🟠 H10. `fetchYouTubeTranscript` references `localhost:8000`

**File:** `src/content/services/transcriptService.ts:127`

```ts
const response = await fetch(`http://localhost:8000/transcript?video_id=${videoId}`);
```

This would only work for the developer running a local Python backend. For all real users, this would 0 connect. The method is currently never called from `fetchLyrics`, so it’s effectively dead code — but if anyone wires it up later they’ll get a confusing failure.

**Fix:** Delete the method, or rewrite to use a real public endpoint.

---

### 🟠 H11. README permissions table doesn’t match `manifest.json`

**File:** `README.md` vs `manifest.json`

README claims:
| Permission | Why |
|---|---|
| `tabs` | Read the active YouTube Music tab URL |

…but `manifest.json` declares `activeTab`, not `tabs`. Documentation drift.

Also, the `host_permissions` for `https://www.youtube.com/*`, `https://lrclib.net/*`, and `https://test-0k.onrender.com/*` are not mentioned in the README at all.

**Fix:** Update README to match the real manifest exactly.

---

## 🟡 Medium-Severity Bugs (Behavioral)

### 🟡 M1. Two `chrome.runtime.onMessage` listeners both handle `TOGGLE_PANEL`

Both `index.tsx` and `App.tsx` register a listener for the same message. They use a `hasBeenActivated` guard, so it works, but it’s confusing. A user reading the code expects one handler.

**Fix:** Move all message handling into `App.tsx`, leaving `index.tsx` with only the activation logic.

---

### 🟡 M2. `setOffset(currentOffset => { ...; return currentOffset; })` is an anti-pattern

**File:** `src/content/hooks/useVideoSync.ts:69-77`

Used inside the RAF loop just to read state. It abuses the setState callback as a "read" mechanism. While React optimizes no-op updates, the call still costs.

**Fix:** Use `offsetRef = useRef<number>(initialOffset)` and update both ref and state when `adjustOffset`/`resetOffset` are called.

---

### 🟡 M3. Initial fetch is delayed by a hard-coded 1 s

**File:** `src/content/hooks/useTranscript.ts:303`

```ts
const timer = setTimeout(() => fetchLyrics(true), 1000);
```

The user always waits a full second before lyrics start being fetched. Maybe needed once because the YT player wasn’t mounted, but the `useTranscript` consumer is rendered inside Panel, which is rendered after `waitForPlayer()` finds the player. So this is double-waiting.

**Fix:** Remove the delay or shorten to 100 ms.

---

### 🟡 M4. Instrumental indicator never fires before the first lyric line

**File:** `src/content/components/Panel.tsx:528-533`

```ts
const isInstrumental = (): boolean => {
    if (currentLineIndex < 0 || currentLineIndex >= lines.length - 1) return false;
    // ...
};
```

`currentLineIndex < 0` is true during the song intro (before the first lyric’s timestamp). So the “instrumental” indicator never shows during intros — only between lines.

**Fix:** Special-case the pre-first-line interval: if `currentLineIndex === -1` and `lines[0].start - currentTime > THRESHOLD`, show the indicator.

---

### 🟡 M5. `chrome.storage.sync.set` on `onInstalled` overwrites user settings on update

**File:** `src/background/service-worker.ts:3-9`

```ts
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
        enabled: true,
        panelWidth: 400,
        fontSize: 32,
    });
});
```

`onInstalled` fires for fresh installs **and version updates**. On every update, the user’s `panelWidth` and `fontSize` are reset to defaults.

**Fix:** Read existing values first; only set defaults for missing keys, or check `details.reason === 'install'`.

---

### 🟡 M6. `confirm()` and `window.location.reload()` for delete

**File:** `src/content/components/Panel.tsx:466-475`

```ts
if (!confirm(`Delete saved lyrics for "${track}" by ${artist}?`)) return;
await storageService.deleteLyrics(artist, track);
window.location.reload(); // ❌ heavy-handed
```

Reloading the entire YouTube page just to refetch lyrics is wasteful and disruptive (loses video position, ad state, etc.).

**Fix:** Trigger `refetch()` from the transcript hook instead.

---

### 🟡 M7. `decodeHTMLEntities` does redundant work

**File:** `src/content/utils/transcriptParser.ts:104-116`

```ts
textarea.innerHTML = text;
return textarea.value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    // ...
```

`textarea.innerHTML = text; textarea.value` already decodes HTML entities. The follow-up `.replace` chain is no-op for properly decoded text and could even mangle text that contains literal `&amp;` after a previous decode pass.

**Fix:** Drop the chained replaces, keep only the textarea trick + `.replace(/\n/g, ' ')` if needed.

---

### 🟡 M8. `cleanVideoTitle` regex is too aggressive

**File:** `src/content/utils/transcriptParser.ts:138-159`

```ts
.replace(/\(?4K\)?/gi, '')
.replace(/\(?HD\)?/gi, '')
```

These match `4K` and `HD` anywhere — even inside legitimate titles like “HD Beat” or “4K Edition”. Worse, they match without word boundaries, so `Headache` could be partially mangled (`HD` → empty, leaving `Heaache`).

**Fix:** Use word boundaries: `\b(4K|HD|HQ|1080p|720p)\b` and constrain to parentheses where appropriate.

---

### 🟡 M9. `seek-to-line` does not re-anchor `currentLineIndex` immediately

When a user clicks a lyric, `seekTo` fires but the visible "active" line only updates when the next RAF tick runs. There’s a 16 ms flash where the previous line is still highlighted.

**Fix:** Eagerly call `setCurrentLineIndex(index)` from `handleLineClick` before seeking.

---

### 🟡 M10. `App.tsx` PIP path injects Google Fonts via `<link>` at runtime

**File:** `src/content/App.tsx:111-114`

The font URL `https://fonts.googleapis.com/css2?family=Figtree:...` is fetched at runtime. This is:

- **Not declared** in `manifest.host_permissions` (manifest only allows youtube.com, music.youtube.com, lrclib.net, test-0k.onrender.com)
- A **third-party network request** every time PIP opens
- **Blocked in some regions / privacy modes** (Brave Shields, uBlock, China)
- A **privacy leak** (Google Fonts can identify users by their unique font request fingerprint)

**Fix:** Bundle the Figtree TTF/WOFF inside the extension and reference via `web_accessible_resources` (which already mentions `fonts/*`, but the folder doesn’t exist).

---

## 🟢 Low-Severity / Code Quality

### 🟢 L1. `tsconfig.json` disables important warnings

```json
"noUnusedLocals": false,
"noUnusedParameters": false,
```

This is why `lyricaService`, `ToggleButton`, and `fetchYouTubeTranscript` have been able to rot in the codebase undetected.

**Fix:** Set both to `true` and clean up the unused vars before re-enabling.

---

### 🟢 L2. No React `ErrorBoundary`

Any unhandled error inside Panel/hooks crashes the entire panel and shows an empty Shadow DOM with no recovery option. Users assume the extension is broken.

**Fix:** Wrap `<Panel>` in an `<ErrorBoundary>` that shows a “Something went wrong, click to retry” fallback.

---

### 🟢 L3. Massive duplicated CSS

`src/content/index.tsx` has a `getStyles()` function with ~600 lines of inline CSS that **duplicates** large chunks of `src/content/styles/panel.css`. Keeping them in sync is now manual.

**Fix:** Move all CSS into `panel.css` and let `?inline` import handle it. Delete `getStyles()`.

---

### 🟢 L4. Three `setTimeout` calls for thumbnail polling on every track change

**File:** `src/content/components/Panel.tsx:209-217`

```ts
useEffect(() => {
    updateThumbnailUrl();
    const timer1 = setTimeout(updateThumbnailUrl, 500);
    const timer2 = setTimeout(updateThumbnailUrl, 1500);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
}, [currentTitle, isLoading, updateThumbnailUrl]);
```

Cleanup is correct. But the polling pattern (call now, 500 ms, 1500 ms) is fragile and chosen by guesswork. A `MutationObserver` on the YT Music player bar would be more reliable.

---

### 🟢 L5. `popup.js` accesses DOM elements without null checks

If the popup HTML structure is ever edited and an element ID is renamed, `popup.js` will throw on load.

**Fix:** Wrap all `getElementById` results in early-return null checks.

---

### 🟢 L6. `parseLrcFormat` last-line gets fixed 5-second duration

**File:** `src/content/utils/transcriptParser.ts:97`

```ts
lines[lines.length - 1].duration = 5;
```

Hard-coded magic number. If a song has a long outro the last line stops being highlighted after 5 seconds.

**Fix:** Use `Infinity` or `videoElement.duration - line.start`.

---

### 🟢 L7. `lyricsSignature` lowercase compare loses meaningful diffs

**File:** `src/content/services/lrclibService.ts:21-23`

```ts
return lines.map(l => l.text.trim().toLowerCase()).join('\n');
```

Two lyrics that differ only in capitalization (e.g., translated vs original) are treated as duplicates and one is silently dropped. May or may not be intentional.

---

### 🟢 L8. Repeated regex compilation in hot path

**File:** `src/content/utils/transcriptParser.ts:80`

```ts
const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.+)/g;
```

Called once per `parseLrcFormat`, but `parseLrcFormat` itself can be called up to 24 × 3 times during multi-strategy LRCLIB search. Tiny perf concern.

---

### 🟢 L9. `Setup_Extension.bat` is Windows-only

No `Setup_Extension.sh` for macOS / Linux contributors. `package.json` already exposes `npm install && npm run build`, so the .bat file is redundant or should be paired with a shell script.

---

### 🟢 L10. Magic numbers everywhere

`THRESHOLD_ULTRA_ENTER_HEIGHT = 80`, `INSTRUMENTAL_GAP_THRESHOLD = 10`, `SONG_CHANGE_DEBOUNCE_MS = 450`, `MIN_WIDTH = 180`, etc. — these are mostly defined as named constants in `Panel.tsx`, which is good. But a few like `0.1` (smoothing factor), `0.85` (decay), `0.7 / 0.3` (interpolation), and `120` (offset clamp) are inline.

**Fix:** Extract to a named-constants file with comments explaining "why this number".

---

## ⚡ Performance Issues

| # | Where | Issue | Suggestion |
|---|---|---|---|
| ⚡ P1 | `useAudioBars.ts` | `setBars([...])` runs ~60 fps causing reconcile churn | Direct DOM writes via ref |
| ⚡ P2 | `Panel.tsx` | Smoothing RAF never stops | Bail when settled |
| ⚡ P3 | `index.tsx` | Top-level MutationObserver never disconnects | Disconnect on unmount |
| ⚡ P4 | `useTranscript.ts` | Three observers + two polls + DOM scrape | Consolidate via single MO; 3-5 s poll cap |
| ⚡ P5 | `useVideoSync.ts` | RAF runs 60 fps even while paused | Already pauses scheduling but still updates `currentTime` ; throttle |
| ⚡ P6 | `transcriptService.fetchFromStorage` | Sequential awaits over 24+ candidates | `Promise.all` for `chrome.storage.local.get` |
| ⚡ P7 | `lrclibService.searchAllByTitle` | Sequential fetches across query plan | `Promise.allSettled` with concurrency cap |
| ⚡ P8 | `AbstractThumbnail.tsx` | Animation runs forever even when panel hidden | Pause when not visible (Intersection Observer) |
| ⚡ P9 | `colorExtractor.ts` | Reloads + redraws image into a fresh canvas every track change | Cache by URL |
| ⚡ P10 | `useAudioBars.ts` | `data` `Uint8Array` reallocated on each `initAudio` retry | Move outside the function |

---

## 🔒 Security & Privacy Concerns

### 🔒 S1. Suspicious host permission `https://test-0k.onrender.com/*`

**File:** `manifest.json`

```json
"host_permissions": [
    ...,
    "https://test-0k.onrender.com/*"
]
```

The only file that uses this URL is `lyricaService.ts`, which is **completely unimported** and dead. Reviewers (and the Chrome Web Store team) will (rightly) flag this as “requesting permission to a personal/test backend with no clear purpose”.

**Fix:** Remove the host permission. Delete `lyricaService.ts`.

---

### 🔒 S2. Google Fonts is loaded at runtime without declared host permission

See [M10](#-m10-apptsx-pip-path-injects-google-fonts-via-link-at-runtime). Runtime requests to `fonts.googleapis.com` from an extension are technically allowed (CSP is relaxed for content scripts) but they do leak user activity timing to Google.

---

### 🔒 S3. Backend at `localhost:8000` referenced in production code

**File:** `src/content/services/transcriptService.ts:127`

Even though the method is never called, leaving `http://localhost:8000` references in shipped code raises eyebrows during review.

---

### 🔒 S4. README + manifest mismatch on permissions

Permission docs don’t match what the manifest actually requests. Users have no way to know what they’re consenting to without opening `chrome://extensions`.

---

### 🔒 S5. No CSP declared in manifest

Manifest V3 supports a `content_security_policy` field for the extension page itself. With React injecting into Shadow DOM, an explicit CSP would harden against accidental `eval`/inline scripts in third-party deps.

---

## 💀 Dead Code & Cleanup

### Files that can be deleted entirely

| File | Size | Reason |
|---|---|---|
| `src/content/services/lyricaService.ts` | 1.9 KB | Only references itself |
| `src/content/components/ToggleButton.tsx` | 2.8 KB | Only references itself |
| `src/content/components/Panel.backup.tsx` | 21.5 KB | Already excluded in `tsconfig`; backup belongs in git history |
| `src/content/services/youtubeTranscriptApi.examples.ts` | 0 B | Empty file |
| `generate-icons.js` and/or `generate-icons.cjs` | small | Both exist; pick one |

### Methods / blocks that can be deleted

- `TranscriptService.fetchYouTubeTranscript` (private, never called)
- `getStyles()` in `index.tsx` (huge inline CSS, duplicates `panel.css`)
- The redundant entity replaces in `decodeHTMLEntities`
- The whole `src/popup/` folder if you don’t plan to fix the popup

### Unused npm dependencies

```jsonc
// package.json — can be removed (verified via grep)
"colorthief": "^2.4.0",   // never imported in src
"tailwindcss": "^3.4.4",  // not used in build, no @tailwind directives anywhere
"autoprefixer": "^10.4.19", // chained from tailwind
"sharp": "^0.34.5"        // only useful in icon generator
"postcss": "^8.4.38"      // chained
```

These also let you delete:

- `postcss.config.js`
- `tailwind.config.js`

That’s ~50 MB off `node_modules` and faster `npm install`.

---

## 📦 Repository Hygiene

### .gitignore is dangerously minimal

Current:
```
node_modules/
dist/
.env
.DS_Store
```

**Missing critical patterns:**

```gitignore
# Editors / IDEs
.vscode/
.idea/

# Build artifacts
*.zip
*.tsbuildinfo
android/.gradle/
android/build/
android/app/build/
android/local.properties
android/.idea/

# Large media (should be in releases or external storage)
Video/
*.mp4

# OS
Thumbs.db
desktop.ini
```

### Files that should not be in the repo

| Path | Size | Why |
|---|---|---|
| `Video/Recording 2026-05-21 122232.mp4` | **78 MB** 🚨 | Demo videos belong on YouTube/releases, not git |
| `StreamLyrics-v1.0.0.zip` | 71 KB | Build artifact; use GitHub Releases |
| `android/build/`, `android/.gradle/`, `android/app/build/` | many MB | Gradle build outputs |
| `android/.idea/` | KB | IntelliJ project files |
| `android/local.properties` | 376 B | Contains absolute SDK path — leak risk |
| `android/frontend/node_modules/` | large | Should be re-generated, not committed |
| `dist/` | varies | Already gitignored — verify it’s not actually committed |
| `.git/objects/a4/8f26f77...` | **44.5 MB** 🚨 | Implies a 44 MB blob was committed at some point — likely the MP4. The git history is bloated even after deletion. |

### Recommended actions

1. Run `git rm -r --cached <files>` for the items above and commit.
2. For the 44 MB git object, consider a `git filter-repo` or `bfg-repo-cleaner` rewrite to get it out of history.
3. Move demo video to YouTube and reference via README link.

---

## ✅ Suggested Fix Order

If you want maximum impact per hour:

### Day 1 — User-facing critical bugs

1. **C1** Decide popup vs onClicked. Fix manifest. (~10 min)
2. **C2** Either remove the misleading log or actually inject. (~15 min)
3. **C4** `if (typeof result.offset === 'number')`. (~5 min)
4. **H7** Persist `panelHeight`, `panelX`, `panelY`, `mode`. (~30 min)
5. **H6** Restore previous size on `handleExpand`. (~15 min)
6. **C3** Fix popup.js URL filter. (~5 min)

### Day 2 — Cleanup & hygiene

7. **S1** Delete `lyricaService.ts` + remove `test-0k.onrender.com` permission.
8. **L1** Enable `noUnusedLocals` / `noUnusedParameters`.
9. **L3** Move CSS out of `getStyles()` into `panel.css`.
10. Delete `Panel.backup.tsx`, `ToggleButton.tsx`, `youtubeTranscriptApi.examples.ts`.
11. Remove unused deps (`tailwindcss`, `autoprefixer`, `colorthief`, `postcss`, `sharp`).
12. Fix `.gitignore`; remove tracked build artifacts and the MP4.

### Day 3 — Performance & polish

13. **P1, P2, P3** Stop runaway RAF + observer leaks.
14. **C5** Multi-timestamp LRC support.
15. **H9** Real dominant color (use the already-installed-but-unused `colorthief`, ironically).
16. **L2** Add a React `ErrorBoundary`.
17. **M5** Don’t reset settings on extension update.

---

## 📝 Final Notes

The codebase shows clear effort and ambition — the multi-source lyrics fallback, the 3-mode adaptive UI, the Shadow DOM isolation, and the audio visualizer are all genuinely cool pieces of engineering.

The biggest wins are simply **deleting things**:

- ~50 MB of unused `node_modules`
- ~80 MB of media + build artifacts in git
- 4 unused source files
- 1 unused method
- 3 unused dependencies in `package.json`
- 1 entire (broken) settings popup, OR fix it properly

After that, the path to a polished v1.1 is mostly straightforward bug-fixing rather than rearchitecture.

---

*Report generated by automated codebase analysis on 2026-05-28.*
