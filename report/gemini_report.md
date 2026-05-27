# StreamLyrics Codebase Audit Report
## Executive Summary

An in-depth technical audit was conducted on the **StreamLyrics-Extension** codebase to identify bugs, performance bottlenecks, architectural risks, and user experience (UX) glitches. 

The codebase is generally well-structured, combining modern technologies like React, TypeScript, Vite, and CRXJS to build a Spotify-style lyrics visualizer for YouTube and YouTube Music. However, several critical issues were discovered that could severely degrade user experience, break core functionality, or result in extension-level failures.

Ten significant bugs, performance bottlenecks, and design limitations have been uncovered, ranging from Chrome Sync storage quota limits to internationalization (i18n) key collisions and performance overhead on low-end machines.

---

## Issue Overview & Severity Ratings

| # | Issue Description | Component / File | Severity | Impact Area |
|---|-------------------|------------------|----------|-------------|
| 1 | `chrome.storage.sync` Write Quota Exceedance | `src/popup/popup.js` | **High** | Core Settings / Stability |
| 2 | Potential Audio Silencing due to CORS in Web Audio | `src/content/hooks/useAudioBars.ts` | **High** | Audio Output / Visualizer |
| 3 | i18n Storage Key Collisions for Non-Latin Scripts | `src/content/services/storageService.ts` | **High** | Database & Persistence |
| 4 | Dominant Color Extraction Lockout Race Condition | `src/content/hooks/useDominantColor.ts` | **Medium** | Visual Aesthetics |
| 5 | Missing Max-Resolution YouTube Thumbnail Fallbacks | `src/content/utils/colorExtractor.ts` | **Medium** | Visual Aesthetics / UX |
| 6 | Active Line Recalculation Skip on Offset Adjust when Paused | `src/content/hooks/useVideoSync.ts` | **Medium** | Video Sync / UX |
| 7 | Lack of Auto-Activation/Hydration on Page Load | `src/content/index.tsx` | **Medium** | Navigation / UX Flow |
| 8 | Severe CPU Overhead from Global MutationObserver | `src/content/hooks/useTranscript.ts` | **Low/Perf** | Device Performance / Battery |
| 9 | Idle `requestAnimationFrame` Loop CPU Drain | `src/content/hooks/useVideoSync.ts` | **Low/Perf** | Device Performance / Battery |
| 10 | Hidden "Instrumental Break" Visual Indicator | `src/content/components/Panel.tsx` | **Low/UX** | Visual Alignment / UX |

---

## Detailed Bug & Glitch Audit

### 1. `chrome.storage.sync` Write Quota Exceedance
> [!WARNING]
> **Severity:** High (Critical Failure Risk)
> **Location:** [popup.js](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/popup/popup.js#L73-L87)

#### Description
The extension registers `'input'` event listeners on the Panel Width and Font Size sliders in the options popup:
```javascript
if (panelWidthSlider && widthValue) {
    panelWidthSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        widthValue.textContent = `${value}px`;
        saveSettings({ panelWidth: value });
    });
}
```
Inside `saveSettings`, it immediately calls `chrome.storage.sync.set(...)` for every pixel of slider movement.

#### Problem & Impact
`chrome.storage.sync` has strict, non-configurable write quotas in Chrome:
- **`MAX_WRITE_OPERATIONS_PER_MINUTE`**: 120 writes
- **`MAX_WRITE_OPERATIONS_PER_HOUR`**: 1800 writes

Dragging either slider back and forth for even 2 seconds can trigger dozens of events, quickly exceeding the 120 writes/minute limit. Once exceeded, Chrome throws a runtime exception, blocks further writes, and breaks user preference saving completely until the quota resets.

#### Recommended Fix
Update the storage write logic to trigger on the `'change'` event (fired when the user releases the slider mouse click) instead of the `'input'` event. The `'input'` event should only be used to update the local DOM text label. Alternatively, implement a debounce function (e.g., 300ms delay) to limit the frequency of storage writes.

---

### 2. Audio Silencing & CORS Block in Web Audio Visualizer
> [!CAUTION]
> **Severity:** High (Severe Functional Risk)
> **Location:** [useAudioBars.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useAudioBars.ts#L62-L64)

#### Description
The extension attempts to construct a real-time frequency visualizer by connecting an `AudioContext` to YouTube's player:
```typescript
const source = audioCtx.createMediaElementSource(mediaEl);
source.connect(newAnalyser);
newAnalyser.connect(audioCtx.destination);
```

#### Problem & Impact
In standard browser security architectures, connecting a cross-origin media element (such as YouTube's `<video>` tag, which plays media streams served from Google Video CDN domains) to a Web Audio API graph silences the audio completely unless the `<video>` element is configured with a `crossorigin="anonymous"` attribute and the CDN server responds with appropriate CORS headers. 

Because YouTube's native player does not set the `crossorigin` attribute, this script can **completely mute the video audio** for the user or fail silently, yielding a flat visualizer. While wrapped in a `try-catch`, this block does not throw an immediate initialization error when CORS silencing occurs, leaving the player broken for users.

#### Recommended Fix
Provide a robust procedural animation fallback that creates mock visualizer bars when real Web Audio analysis fails or is blocked by CORS. Alternatively, restrict Web Audio binding or let users toggle real-time visualizers off if audio silencing is detected.

---

### 3. Internationalization (i18n) Key Collisions for Non-Latin Scripts
> [!WARNING]
> **Severity:** High (Global Usability Failure)
> **Location:** [storageService.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/services/storageService.ts#L24-L28)

#### Description
The storage service calculates the local storage lookup key for a track using this sanitization function:
```typescript
function getStorageKey(artist: string, title: string): string {
    const safeArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${STORAGE_PREFIX}${safeArtist}_${safeTitle}`;
}
```

#### Problem & Impact
The regular expression `/[^a-z0-9]/g` strips out **all** non-ASCII characters. For songs written in non-Latin scripts (Japanese, Chinese, Korean, Hindi, Cyrillic, Greek, Arabic, etc.), the title and artist resolve to completely empty strings `""`. 
For example:
- Artist `米津玄師` and Title `Lemon` will generate `lyrics__lemon`.
- Artist `米津玄師` and Title `打上花火` (pure Japanese characters) will generate `lyrics__`.
- Another Japanese song with no Latin letters will *also* generate `lyrics__`.

All such non-ASCII songs will share the identical key `lyrics__`, causing them to overwrite each other's cache, load incorrect synced lyrics, or fail to persist.

#### Recommended Fix
Instead of stripping non-Latin characters, use a modern URL-safe encoding scheme like `encodeURIComponent(artist.toLowerCase())` or utilize a standard cryptographic hashing algorithm (like SHA-1/MD5 or a simple FNV-1a hash function) to generate unique, predictable alphanumeric keys from the raw unicode strings.

---

### 4. Dominant Color Extraction Lockout Race Condition
> [!IMPORTANT]
> **Severity:** Medium (Visual/Aesthetic Glitch)
> **Location:** [useDominantColor.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useDominantColor.ts#L22-L24)

#### Description
The `useDominantColor` hook prevents parallel image downloads using a simple boolean ref flag:
```typescript
const extractColor = async (url: string) => {
    if (url === lastThumbnailRef.current || extractingRef.current) {
        return;
    }

    extractingRef.current = true;
    lastThumbnailRef.current = url;
    ...
```

#### Problem & Impact
If the user triggers a fast soft navigation (e.g., clicking on a recommended video immediately after starting another one), the `thumbnailUrl` updates while the previous color extraction is still executing (`extractingRef.current === true`). 
The hook detects the true flag and **silently discards the new request**, returning immediately. Once the original promise resolves, `extractingRef.current` resets to `false`, but the visualizer will remain locked onto the previous track's color palette (or the default fallback) because the latest track's extraction was discarded.

#### Recommended Fix
Remove the simple `extractingRef.current` guard. Instead, track the current request's URL within the `useEffect` scope and compare it inside the promise resolution. If the active `thumbnailUrl` has changed, discard the resolved promise's result:
```typescript
useEffect(() => {
    let active = true;
    const extract = async () => {
        const color = await extractDominantColor(thumbnailUrl);
        if (active) setColor(color);
    };
    extract();
    return () => { active = false; };
}, [thumbnailUrl]);
```

---

### 5. Missing Max-Resolution YouTube Thumbnail Fallbacks
> [!IMPORTANT]
> **Severity:** Medium (Visual Glitch)
> **Location:** [colorExtractor.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/utils/colorExtractor.ts#L82-L84)

#### Description
The thumbnail parser retrieves the maximum resolution thumbnail for a video ID:
```typescript
export function getThumbnailUrl(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}
```

#### Problem & Impact
YouTube only generates `maxresdefault.jpg` thumbnails if the uploaded video is in HD (720p, 1080p, or higher). For standard definition (SD), vintage, or older music videos, this URL returns a `404 Not Found` error. 
When this fails, `loadImage` errors out, forcing the dominant color extractor to settle on the generic red fallback `#8B3A3A`. This ruins the modern, responsive gradient/ambient look of the panel for millions of older music tracks.

#### Recommended Fix
Modify the image loader to try `maxresdefault.jpg` first, and if it triggers an `onerror` event, gracefully fall back to the standard-definition `hqdefault.jpg` (which is guaranteed to exist for all uploaded YouTube videos):
```typescript
function loadImage(url: string, fallbackUrl?: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            if (fallbackUrl) {
                img.src = fallbackUrl;
                fallbackUrl = undefined; // avoid loop
            } else {
                reject(new Error(`Failed to load image`));
            }
        };
        img.src = url;
    });
}
```

---

### 6. Active Line Recalculation Skip when Paused
> [!NOTE]
> **Severity:** Medium (UX Glitch)
> **Location:** [useVideoSync.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useVideoSync.ts#L83-L90)

#### Description
The synchronization loop skips lyric calculation entirely if the player is paused:
```typescript
if (!video.paused) {
    const newIndex = findCurrentLineIndex(time);
    if (newIndex !== lastLineIndexRef.current) {
        lastLineIndexRef.current = newIndex;
        setCurrentLineIndex(newIndex);
    }
}
```

#### Problem & Impact
If a user adjusts the manual lyrics offset (using the `+` or `-` adjustment controls) while the video is **paused**, the active line will not be recalculated. The UI will appear frozen, and the new offset will not be reflected visually. The highlighted active line will only snap to its correct place once the video resumes playing.

#### Recommended Fix
Allow `findCurrentLineIndex` to run inside the sync tick even when the video is paused, or trigger a manual recalculation whenever the `offset` state updates, independent of the video's paused/playing state.

---

### 7. Lack of Auto-Activation/Hydration on Page Load
> [!NOTE]
> **Severity:** Medium (UX Friction)
> **Location:** [index.tsx](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/index.tsx#L21-L26)

#### Description
The content script entry point waits exclusively for a direct `TOGGLE_PANEL` message from the service worker background process to call `init()`:
```typescript
chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'TOGGLE_PANEL') return;
    if (!hasBeenActivated) {
        hasBeenActivated = true;
        init(true);
    }
});
```

#### Problem & Impact
Even if the user previously had the lyrics panel open (`panelVisible: true` in local storage) and has settings enabled, navigating to a new tab or opening a new YouTube video in a fresh tab will not restore the panel automatically. The user is forced to click the extension's toolbar icon on every single page load, creating high interaction friction.

#### Recommended Fix
Query local storage during content script bootstrap. If `panelVisible === true` is retrieved, invoke `init(true)` immediately to mount the panel automatically on page navigation.

---

### 8. Severe CPU Overhead from Global MutationObserver
> [!IMPORTANT]
> **Severity:** Low/Performance (Performance Degradation)
> **Location:** [useTranscript.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useTranscript.ts#L279-L283)

#### Description
To catch track changes, the extension attaches a `MutationObserver` to the entire body of the page:
```typescript
observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
});
```

#### Problem & Impact
YouTube is a highly complex, single-page application (SPA). Elements such as progress bars, ads, comment sections, video players, visualizers, and recommendations update hundreds of times per second. 
Attaching a full recursive listener to `document.body` causes the browser to invoke the observer callback continuously. While the callback is debounced internally, the initial overhead of processing these mutations can cause micro-stutters and frame drops, particularly on budget laptops or devices playing high-resolution videos.

#### Recommended Fix
Avoid observing the entire `document.body`. Instead, focus the `MutationObserver` on specific container elements that hold track metadata (such as `#above-the-fold` on YouTube or `ytmusic-player-bar` on YouTube Music).

---

### 9. Idle `requestAnimationFrame` Loop CPU Drain
> [!NOTE]
> **Severity:** Low/Performance (Battery Drain)
> **Location:** [useVideoSync.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useVideoSync.ts#L155-L165)

#### Description
The sync loop schedules itself recursively on every frame via `requestAnimationFrame`:
```typescript
rafIdRef.current = requestAnimationFrame(syncLoop);
```

#### Problem & Impact
The `requestAnimationFrame` loop fires constantly (60 to 144 times per second) regardless of whether the video is active or the extension panel is visible. When the video is paused or the tab is running in the background, this constant firing consumes CPU cycles unnecessarily, contributing to thermal throttle and accelerating battery drain.

#### Recommended Fix
Pause the `requestAnimationFrame` scheduling whenever the video is paused or when the lyrics panel is closed/invisible. Use the video element's `'play'` and `'pause'` event listeners to dynamically start and stop the sync loop.

---

### 10. Hidden / Out-of-Viewport "Instrumental Break" Visual Indicator
> [!NOTE]
> **Severity:** Low/UX (Visual Polish)
> **Location:** [Panel.tsx](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/components/Panel.tsx#L944-L946)

#### Description
The instrumental break alert element is appended to the bottom of the scroll container:
```typescript
<div ref={scrollRef} className="streamlyrics-scroll-container">
    {lines.map((line, index) => (...))}

    {isInstrumental() && (
        <div className="instrumental-break">♪ Instrumental ♪</div>
    )}
</div>
```

#### Problem & Impact
`isInstrumental()` correctly evaluates to `true` during a long instrumental break. However, because the container only auto-scrolls to position the currently active line at the top third of the viewport, the instrumental break indicator appended at the bottom of the container remains scrolled out of view. The user will almost never see the "Instrumental" notification during mid-song breaks.

#### Recommended Fix
Render the "Instrumental Break" notification as a floating overlay card in the center of the lyrics panel, or insert it dynamically as an inline line item between the active and next lyric lines in the array map, ensuring it is positioned within the visible viewport.

---
*Report compiled automatically by Gemini.*
