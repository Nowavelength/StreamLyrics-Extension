# AGENTS.md — StreamLyrics

> Read this first if you are an AI agent (or human) working on this codebase.
> It is intentionally tight. Read the code for details; read this for the
> *mental model*. Last verified against the codebase on 2026-05-28.

---

## Elevator pitch

StreamLyrics is a Chrome MV3 extension that overlays a draggable, resizable,
mode-shifting **lyrics panel** on YouTube and YouTube Music pages. It pulls
timestamped lyrics from local storage first, then LRCLIB, syncs them to the
page's `<video>` element with sub-frame precision, and morphs between three
layouts (**full** → **mini** → **ultra**) based on its current dimensions.

Stack: React 18 + TypeScript, Vite + CRXJS, vanilla CSS inside a Shadow DOM,
Web Audio API (`AnalyserNode` FFT), `colorthief` for palette extraction.

Build: `npm run build` (produces `dist/`, which is what loads into Chrome).
Dev: `npm run dev` (Vite watch mode; reload the extension after each rebuild).

---

## Folder map

```
manifest.json                Manifest V3. options_ui points to popup.html.
vite.config.ts               One-liner — CRXJS reads manifest.json directly.
tsconfig.json                Strict mode, noUnusedLocals/Parameters on.
icons/                       16/48/128 PNGs (regenerated from lyrics_extention.svg).
README.md                    User-facing.
report/BUG_REPORT.md         One-time audit, 2026-05-28. Historical reference, NOT a living doc.

src/
  background/
    service-worker.ts        Toolbar click handler. Sends TOGGLE_PANEL; falls
                             back to chrome.scripting.executeScript if the
                             content script isn't loaded yet.

  content/
    index.tsx                Content script entry. Mounts Shadow DOM, React
                             root, listens for TOGGLE_PANEL. Disconnects all
                             observers on `pagehide`.
    App.tsx                  Top-level component. Owns visibility, PiP window
                             lifecycle, ErrorBoundary.

    components/
      Panel.tsx              The big one (~1000 lines). Owns layout state,
                             renders the three modes, drag/resize, dock
                             collapse, lyric slide animation, layout
                             persistence.
      LyricLine.tsx          Single line; past / active / future styling.
      AbstractThumbnail.tsx  Procedural fallback when no album art. Pauses
                             canvas animation when not visible (active prop).
      icons.tsx              Inline SVG icon components.

    hooks/
      useTranscript.ts       Lyrics fetch loop. Initial backoff, song-change
                             detection (MutationObserver + poll + media
                             events), source switching, alternatives cycler.
      useVideoSync.ts        Maps page <video>.currentTime → current line
                             index via binary search. Throttled RAF loop.
                             Exposes setLineIndex for eager click feedback.
      useAudioBars.ts        AnalyserNode FFT into 32 mirrored bars. Audio
                             graph cached in a WeakMap keyed by the media
                             element so it survives React remounts.
      useDominantColor.ts    Async ColorThief extraction with URL cache.
      useSettings.ts         chrome.storage.sync user prefs.

    services/
      transcriptService.ts   Fetch waterfall: local saved → LRCLIB.
      lrclibService.ts       Multi-strategy LRCLIB queries with concurrency 4.
      storageService.ts      chrome.storage.local saved-lyrics CRUD.

    utils/
      transcriptParser.ts    Title parsing, LRC parser (handles
                             multi-timestamp lines), getCurrentTrackInfo,
                             candidate generation.
      colorExtractor.ts      ColorThief wrapper, vibrantize() saturation
                             booster, getThumbnailUrl().

    types/index.ts           LyricLine + a few small types.
    styles/panel.css         ALL Shadow DOM CSS. Single source of truth.

  popup/                     Settings page (options_ui — right-click toolbar
                             icon → Options). HTML/CSS/JS, no React here.
```

---

## Mental models

### Sync engine — `useVideoSync.ts`

- The page's `<video>` element is the source of truth. We find it once via
  selector list with a MutationObserver fallback, cached in `videoRef`.
- One `requestAnimationFrame` loop reads `video.currentTime` per frame.
- The current line index is found with **binary search** over `lines` (sorted
  by start time).
- React state for `currentTime` is **throttled to ~10 fps** — the line *index*
  is what matters, and lines change every few seconds, so we don't need 60 fps
  state churn.
- `offsetRef` (a `useRef`) is read inside the RAF callback. State `offset` is
  for re-render only. Don't unify these — closures over state inside the RAF
  go stale.
- Pause/play/seeked listeners fire eagerly so the UI reacts even when the RAF
  tick is throttled.
- `setLineIndex` is exposed so click-to-seek can immediately highlight a line
  before the seek+RAF round-trip catches up.

### Lyrics fetch waterfall — `useTranscript.ts` + `transcriptService.ts`

- On mount: a **backoff retry** at 50/150/350/700/1200/2000ms until DOM has
  track metadata. Without this the first fetch fires before YouTube populates
  the title element and silently bails.
- Track-change detection runs **three redundant paths in parallel**:
  1. MutationObserver on `document.body` (debounced 300ms)
  2. 2.5s `setInterval` poll
  3. `<video>` media events (`loadedmetadata`, `play`, `playing`, etc.)
  All funnel into `scheduleTrackCheck`.
- **Recovery path:** if `lastFetchedSignatureRef.current` is empty when
  `scheduleTrackCheck` first sees a valid signature (i.e., initial fetch never
  succeeded), it fires one immediately. Don't remove this.
- Service waterfall: `fetchFromStorage` first (parallel candidate lookups via
  `Promise.all`), then `fetchAllFromLrclib` (~12 query strategies running with
  `CONCURRENCY = 4`).
- A partial-result callback streams the first hit to the UI early; subsequent
  results populate the alternatives cycler ("next result" button).

### Audio graph — `useAudioBars.ts`

- A `MediaElementAudioSourceNode` can be created **only once per `<video>`
  element**, browser policy. So `AudioContext + source + analyser` are cached
  in a `WeakMap` keyed by the media element.
- The cache survives React unmounts. We **deliberately do not** call
  `audioCtx.close()` in cleanup. Don't "fix" this.
- The render loop is throttled to **30 fps** via a frame-budget gate. When
  the video pauses, bars decay over a few frames, then the loop stops
  scheduling itself entirely until a `play` event resumes it.
- Bar layout: 32 bars, **mirrored** — bass at center, treble at edges.

### Layout & persistence — `Panel.tsx`

Two storage namespaces, do not mix them up:

- `chrome.storage.sync` — user-tunable settings (`enabled`, `panelWidth`,
  `fontSize`). Synced across devices. Populated by the popup.
- `chrome.storage.local` — instance state (full layout `width/height/x/y/`
  `dockCollapsed`, plus `panelVisible`). Local only. Single key:
  `streamlyrics_panel_layout`.

On mount the panel hydrates from `local` and **snaps `smoothWidth/Height/`
`playerMode` in the same React batch** as `panelWidth/Height` to avoid a
wrong-mode flash (e.g., full mode briefly rendered at ultra dimensions).

`lastFullSizeRef` is captured from a hydrated layout **only if** that layout
was actually in full mode — otherwise pressing Expand later would restore
ultra/mini dims.

`playerMode` is computed via **hysteresis** (`getNextPlayerMode`): different
enter/exit thresholds prevent flicker on the boundary.

### Color pipeline — `colorExtractor.ts`

```
thumbnail URL → <img crossOrigin="anonymous">
              → ColorThief.getColor()      // median-cut quantize
              → adjustForReadability()      // clamp lightness for text
              → hex#RRGGBB                  // cached by URL in a Map
```

`vibrantize(hex)` is a separate transform applied for accent colors:
`hex → HSL → +30 saturation, lightness clamped 50–72 → rgba(...)`.
Used for the mini/ultra visualizer bar color.

### Player modes

- **full** — main panel: lyrics scroller, header, offset controls, dock
  (visualizer + metadata cockpit + transport controls).
- **mini** — compact square Spotify-card. Triggered when
  `width × height ≤ 135,000 px²` (exit at 155,000).
- **ultra** — capsule pill. Triggered when `height ≤ 80 px` (exit at 100).
- Mini and ultra display only the current line; full mode renders the entire
  scrolling list.
- The pill's center lyric only renders when `activeWidth >= 380` to avoid
  cramping; below that, an empty `.spotify-pill-spacer` keeps `pill-right`
  pinned to the right edge.

### Picture-in-Picture

- Uses **Document PiP** (`window.documentPictureInPicture.requestWindow`).
  Chrome 116+.
- The Panel renders into a portal (`createPortal` to `pipWindow.document.`
  `body`) when `pipWindow !== null`.
- Styles are duplicated into the PiP doc's `<head>` because Shadow DOM does
  not extend across windows.
- `pipWindow.document.title` is set on open AND kept in sync by a useEffect
  in Panel.tsx — that's how the title bar shows the track name instead of
  the host origin.
- A favicon `<link>` is injected pointing at `chrome.runtime.getURL(`
  `'icons/icon48.png')`.
- `.in-pip-window` is a marker class applied to **all three modes** when in
  PiP. CSS uses it to flatten border-radius / borders / shadows so the panel
  sits edge-to-edge.

### Dock collapse (full mode only)

- An × button on the player dock toggles `dockCollapsed` (persisted).
- When collapsed: metadata cockpit + transport controls hide. The visualizer
  remains rendered but shrinks into a centered pill at the bottom (smaller
  bars, ~14px height). A floating chevron-up button at bottom-right brings
  the dock back.
- The lyrics scroll container expands its height when `dock-collapsed` class
  is set on the panel.

### Lyric slide animation (ultra mode)

- The current lyric is held in two snapshots: `displayedLyric` and
  `previousLyric` (each `{ text, fontSize }`).
- When `currentLineText` changes, the displayed snapshot moves into
  `previousLyric` (slides up and out) and the new line becomes
  `displayedLyric` (slides up from below). After ~360ms the previous is
  dropped.
- Animation: `@keyframes pill-lyric-slide-in` and `pill-lyric-slide-out` in
  `panel.css`. Duration = 320ms; the JS timer (360ms) intentionally leaves a
  small buffer.

---

## State map

| State                                  | Where                       | Notes                                                                     |
|----------------------------------------|-----------------------------|---------------------------------------------------------------------------|
| `enabled`, `panelWidth`, `fontSize`    | `chrome.storage.sync`       | User-tunable. Popup sets, `useSettings` reads.                            |
| panel layout (w/h/x/y, dockCollapsed)  | `chrome.storage.local`      | Single key `streamlyrics_panel_layout`. Hydrated in Panel mount effect.   |
| `panelVisible`                         | `chrome.storage.local`      | Restored on mount, persisted on toggle.                                   |
| Saved lyrics                           | `chrome.storage.local`      | Key prefix `lyrics_<sanitizedArtist>_<sanitizedTitle>`.                   |
| `currentLineIndex`                     | `useState` in useVideoSync  | Driven by RAF; eagerly settable via `setLineIndex`.                       |
| `offset`                               | `useState` + `useRef`       | Ref read in RAF; state for re-render.                                     |
| Audio graph (ctx/source/analyser)      | `WeakMap<HTMLMediaElement>` | Survives React unmounts. Module-level singleton.                          |
| Track signature                        | `useRef` in useTranscript   | Used to dedupe fetches across DOM updates.                                |
| Color cache                            | `Map<url, hex>`             | Module-level in colorExtractor.ts.                                        |
| `displayedLyric` / `previousLyric`     | `useState` in Panel         | Snapshots for ultra slide animation.                                      |

---

## Gotchas (looks like a bug, isn't)

- **`if (offset)` is wrong.** Use `typeof === 'number'`. A valid `0` offset
  is falsy and silently skipped otherwise. This is also true for any nullable
  numeric field returned by services.
- **`MediaElementAudioSourceNode` is one-shot.** Don't `new AudioContext()`
  per mount. Always go through the `audioGraphCache` WeakMap.
- **`margin: auto` on a flex item eats free space *before* `flex-grow`.**
  Don't put `margin-left: auto` on `pill-right` if you want a `flex: 1`
  lyric next to it — the lyric will get 0px width.
- **The audio graph routes audio through `analyser.connect(destination)`.**
  If you break this connection, the page's audio dies. Test playback after
  any `useAudioBars` change.
- **`lastFullSizeRef` deliberately doesn't update in non-full modes.**
  Otherwise pressing Expand from ultra would restore to ultra dims.
- **`useVideoSync` reads offset from a ref, not state.** Don't replace the
  ref with state in the RAF loop — closures will go stale.
- **Track-change detection has three redundant paths.** Intentional. YT
  Music's DOM is unreliable; the poll + MutationObserver + media events
  catch different update patterns.
- **Initial fetch backoff is critical.** Removing it without keeping the
  recovery path in `scheduleTrackCheck` brings back the "lyrics never load"
  bug.
- **The CSS lives only in `panel.css`.** There is no `<link>` to Google
  Fonts and there is no inline CSS in `index.tsx` (was deleted in cleanup).
  Adding global CSS goes in `panel.css`.
- **Vite + CRXJS handles `manifest.json` directly.** Don't reference assets
  from JS by relative path; use `chrome.runtime.getURL(...)` or let CRXJS
  rewrite imports.
- **The popup is reachable via right-click → Options, not a left-click
  popup.** The toolbar click toggles the panel (handled by service worker).
- **Service worker must `chrome.scripting.executeScript` if `sendMessage`
  rejects.** That's how the panel appears on tabs that were opened *before*
  install.
- **Document PiP cannot remove the browser-supplied title bar.** You can
  only customize `document.title` and `<link rel=icon>` inside it.
- **Shadow DOM doesn't extend into PiP.** Styles must be re-injected into
  the PiP document's `<head>`.
- **`-webkit-line-clamp` requires `display: -webkit-box`** plus
  `-webkit-box-orient: vertical` and `overflow: hidden`. All three. If you
  put them on a flex item that is also `display: flex`, the clamp wins and
  flex behavior breaks. Wrap the text in a child span (see
  `.pill-lyric-text`).

---

## Common tasks

| Goal                                       | Entry point                                                                       |
|--------------------------------------------|-----------------------------------------------------------------------------------|
| Add a new lyrics source                    | New service in `services/`. Plug into `transcriptService.fetchLyrics` waterfall. Match the partial-result callback signature. |
| Add a new player mode                      | Constants at top of `Panel.tsx` (`THRESHOLD_*`). Extend `PlayerMode` union. Add hysteresis branch in `getNextPlayerMode`. Add a render branch. |
| Add a setting                              | (a) `DEFAULT_SETTINGS` in `service-worker.ts` AND `useSettings.ts` AND `popup.js`. (b) Wire UI in `popup.html` + `popup.js`. (c) Consume in components. |
| Tighten/loosen a layout threshold          | Constants at top of `Panel.tsx`.                                                  |
| Change fetch latency                       | `delays` array in `useTranscript.ts` initial fetch effect; `POLL_INTERVAL_MS`; `SONG_CHANGE_DEBOUNCE_MS`. |
| Tweak slide animation                      | `@keyframes pill-lyric-slide-in/out` in `panel.css`. JS snapshot timer in `Panel.tsx` MUST be ≥ animation duration. |
| Add a CSS class                            | `panel.css`. The CSS var `--lyric-font-size` is already available.                |
| Add a permission                           | `manifest.json` + `README.md` permissions table + audit `host_permissions` for trailing `/*`. |
| Add a new icon                             | `components/icons.tsx`. SVG with `currentColor` so it inherits.                   |
| Adjust mode-specific style overrides       | Compound selectors with `.mode-mini.streamlyrics-panel` etc. Use `!important` to beat existing rules (the codebase already does). |

---

## Glossary

| Term                | Meaning                                                                                                          |
|---------------------|------------------------------------------------------------------------------------------------------------------|
| **Bars hook**       | `useAudioBars`. Returns 32 normalized FFT amplitudes, mirrored (bass center, treble edges).                      |
| **Dock**            | The bottom strip of the full-mode panel: visualizer + metadata cockpit + transport controls.                     |
| **Dock collapsed**  | User-toggled state where the dock hides but the visualizer continues as a small pill at the bottom-center.       |
| **Layout**          | Persisted panel geometry (width/height/x/y/dockCollapsed). `chrome.storage.local`, key `streamlyrics_panel_layout`. |
| **Settings**        | User preferences (enabled, panelWidth, fontSize). `chrome.storage.sync`.                                         |
| **Pill**            | Synonym for ultra mode (capsule-shaped player).                                                                  |
| **Hysteresis**      | The gap between enter and exit thresholds for player modes — prevents flicker.                                   |
| **Vibrantize**      | Utility that boosts a hex color's saturation and lightness for use as an accent (mini/ultra bar color).          |
| **Stack (lyric)**   | `.spotify-pill-lyric-stack` — absolute-positioned container holding entering and leaving lyric layers.           |
| **Source**          | Lyrics provider tag — one of `'local'`, `'lrclib'`. `'youtube'` is reserved (no live YT-captions implementation). |
| **Signature**       | Track identity string for fetch dedup; built from videoId + title + artist + album.                              |
| **Active width/height** | The dimension currently driving layout — `panelWidth/Height` in-page, `pipWidth/Height` in PiP.              |
| **Last full size**  | The most recent full-mode dimensions, captured in `lastFullSizeRef`. Used by Expand to restore.                  |

---

## Search anchors

> The following paragraph is a deliberate keyword dump so embedding-based and
> keyword-based search land on this file for queries about any subsystem.

streamlyrics chrome extension manifest v3 react vite crxjs typescript shadow
dom youtube youtube music lyrics overlay synced lyrics lrclib lrc parser
timestamp panel resize drag handle player mode hysteresis full mini ultra
capsule pill spotify mini player audio visualizer fft analyser node web audio
mediaelementaudiosource weakmap audiocontext singleton cache album art
thumbnail dominant color colorthief median cut vibrant accent bar settings
popup options page chrome storage sync local panel visible toggle service
worker scripting permission inject content script document pip picture in
picture portal createportal title bar favicon shadow dom isolation observer
mutation observer initial fetch backoff debounce schedule track check song
change detection animation requestanimationframe raf throttle slide in slide
out lyric snapshot dock collapse player dock visualizer bars vibrantize hsl
saturation hex rgba mask image cutout text info gridgrid spotify pill content
layout persistence chrome runtime getURL extension url icon size threshold
ultra enter exit area mini lyric font size adaptive line clamp 3 lines
lastfullsize ref playerMode active width pip window pop out window edge to
edge border radius zero in pip window error boundary panel error boundary
abstract thumbnail canvas animation pause when not visible offset reset
seek to line eager click feedback past lyric greyish white auto scroll
container current line index binary search render frame budget pause decay
play wake mediaSession metadata navigator media session.

---

## Don'ts

- Don't add Google Fonts or any third-party font CDN. Manrope is bundled
  locally and registered per document through `src/shared/manropeFont.ts`;
  the system stack in `panel.css` is the offline fallback.
- Don't add new `host_permissions` without updating `README.md`.
- Don't write to `chrome.storage.sync` from anywhere other than the popup or
  the service worker's onInstalled (sync has tight quotas; the panel itself
  uses local).
- Don't add inline CSS in JSX strings. Use `panel.css`.
- Don't `audioCtx.close()` in `useAudioBars` cleanup.
- Don't commit `dist/` — it's auto-generated by `npm run build` and is in
  `.gitignore`.
- Don't add files in `/Problem/` or `/Video/` to git — those are for local
  reference only.

---

*End of file. If something here disagrees with the code, the code wins —
please update this file and remove the contradiction.*
