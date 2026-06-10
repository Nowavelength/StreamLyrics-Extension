# Implementation Plan — i18n Storage Keys, Web Audio Safeguards & Dual-Resolution Mini Album Art

This updated implementation plan details the precise technical solutions and code changes proposed to resolve:
1. **C2: Local Storage Key Collisions for Non-Latin (i18n) Song Scripts** in [storageService.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/services/storageService.ts).
2. **C3: CORS Silencing & Lack of Visualizer Procedural Fallback** in [useAudioBars.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useAudioBars.ts).
3. **NEW: Dual-Resolution Thumbnail Pipeline for Crisp Album Art in Mini Mode** in [Panel.tsx](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/components/Panel.tsx) and [colorExtractor.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/utils/colorExtractor.ts).

All other bugs (C1, H1, H2, etc.) are neglected as per user instructions.

---

## 📑 Proposed Technical Solutions

### 1. Internationalization (i18n) Storage Keys with Backward Compatibility
* **Target File:** [storageService.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/services/storageService.ts)
* **Design Strategy:**
  We will replace the overly aggressive regex-stripping key generator with a hybrid key generator. To ensure **perfect backward compatibility** (so existing Latin-only users do not lose their locally saved/preferred lyrics), the generator will:
  1. Calculate the old-style key (replacing everything non-alphanumeric with `""`).
  2. If BOTH the sanitized artist and title are non-empty (meaning it is a standard Latin-only song), use and return the old-style key format.
  3. If EITHER is empty (meaning it's in a non-Latin script like Japanese, Hindi, Chinese, etc.), fallback to generating a clean, unique key prefixed with `lyrics_i18n_` followed by the URL-encoded (or safely hashed) unicode version.

#### Code Change in `storageService.ts`:
```typescript
/**
 * Sanitize artist and title for storage key.
 * Preserves backward compatibility for standard Latin tracks while generating
 * unique, safe-encoded keys for non-Latin (i18n) scripts.
 */
function getStorageKey(artist: string, title: string): string {
    const rawArtist = artist.trim().toLowerCase();
    const rawTitle = title.trim().toLowerCase();

    // 1. Generate old-style key for backwards compatibility
    const oldArtist = rawArtist.replace(/[^a-z0-9]/g, '');
    const oldTitle = rawTitle.replace(/[^a-z0-9]/g, '');
    
    // If it's a standard Latin-only track, use the old key format so 
    // existing user cache is fully preserved.
    if (oldArtist.length > 0 && oldTitle.length > 0) {
        return `${STORAGE_PREFIX}${oldArtist}_${oldTitle}`;
    }

    // 2. For international scripts, generate a unique, safe key using URL encoding
    // replacing percent signs with underscores to keep keys clean in Chrome local storage
    const safeArtist = encodeURIComponent(rawArtist).replace(/%/g, '_');
    const safeTitle = encodeURIComponent(rawTitle).replace(/%/g, '_');
    return `${STORAGE_PREFIX}i18n_${safeArtist}_${safeTitle}`;
}
```

---

### 2. CORS / Web Audio Protection & Procedural Visualizer Fallback
* **Target File:** [useAudioBars.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/hooks/useAudioBars.ts)
* **Design Strategy:**
  To completely protect players from browser-enforced audio silencing (due to cross-origin media connection failures) and visualizer freezing, we will introduce a **hybrid execution mode**:
  1. Wrap the entire `AudioContext` and `createMediaElementSource` creation block inside a `try-catch` safeguard.
  2. If creation throws an error, or if browser autoplay policy blocks the audio graph, set an internal flag `isProceduralRef.current = true` but **do not** abort initialization. Instead, let the `tick()` animation loop continue running.
  3. In the animation loop, if `isProceduralRef.current` is true, generate beautiful, flowing procedural waves based on dynamic mathematical sine and cosine formulas. These mock wave frequencies simulate a premium mirrored equalizer (bass-heavy in the center, treble-decay at the edges) and keep the UI visually alive.

#### Code Change in `useAudioBars.ts`:
```typescript
export function useAudioBars(barCount = 32) {
    const [bars, setBars] = useState<number[]>(
        Array.from({ length: barCount }, () => 0.05),
    );
    const barsRef = useRef<number[]>(
        Array.from({ length: barCount }, () => 0.05),
    );
    // Track if we are using procedural mock visualizer fallback
    const isProceduralRef = useRef(false);

    useEffect(() => {
        let rafId = 0;
        let analyser: AnalyserNode | null = null;
        let data: Uint8Array | null = null;
        let mediaEl: HTMLMediaElement | null = null;
        let isActive = true;
        let lastFrame = 0;
        let cleanupListener: (() => void) | null = null;

        const init = () => {
            mediaEl = findActiveVideo();

            if (!mediaEl) {
                if (isActive) rafId = requestAnimationFrame(init);
                return;
            }

            // Singleton audio graph per element.
            if (!audioGraphCache.has(mediaEl)) {
                try {
                    const audioCtx = new (window.AudioContext ||
                        (window as any).webkitAudioContext)();
                    const newAnalyser = audioCtx.createAnalyser();
                    newAnalyser.fftSize = 256;
                    newAnalyser.smoothingTimeConstant = 0.8;

                    const source = audioCtx.createMediaElementSource(mediaEl);
                    source.connect(newAnalyser);
                    newAnalyser.connect(audioCtx.destination);

                    audioGraphCache.set(mediaEl, {
                        audioCtx,
                        analyser: newAnalyser,
                        source,
                    });
                    isProceduralRef.current = false;
                } catch (e) {
                    console.warn(
                        '[StreamLyrics] Audio graph could not be created; falling back to procedural mock waves:',
                        e,
                    );
                    isProceduralRef.current = true;
                }
            }

            const cached = audioGraphCache.get(mediaEl);
            if (cached) {
                analyser = cached.analyser;
                data = new Uint8Array(analyser.frequencyBinCount);
            } else {
                isProceduralRef.current = true;
            }

            const tick = (now: number) => {
                if (!isActive || !mediaEl) return;

                // FPS gate.
                if (now - lastFrame < FRAME_BUDGET_MS) {
                    rafId = requestAnimationFrame(tick);
                    return;
                }
                lastFrame = now;

                if (cached && cached.audioCtx.state === 'suspended' && !mediaEl.paused) {
                    cached.audioCtx.resume().catch(() => {});
                }

                if (mediaEl.paused) {
                    // Decay to baseline
                    let settled = true;
                    barsRef.current = barsRef.current.map((v) => {
                        const next = Math.max(0.05, v * 0.85);
                        if (next > 0.051) settled = false;
                        return next;
                    });
                    setBars([...barsRef.current]);
                    if (!settled) rafId = requestAnimationFrame(tick);
                    return;
                }

                if (isProceduralRef.current || !analyser || !data) {
                    // --- Procedural Fallback Mode ---
                    // Generates smooth, beautiful mirrored mock waves (bass center, treble edge)
                    const timeFactor = performance.now() * 0.0035;
                    const next = Array.from({ length: barCount }, (_, i) => {
                        const half = barCount / 2;
                        const centerDist =
                            i < half
                                ? (half - 1 - i) / (half - 1)
                                : (i - half) / (half - 1);

                        const wave1 = Math.sin(timeFactor + i * 0.22) * 0.35 + 0.35;
                        const wave2 = Math.cos(timeFactor * 0.73 - i * 0.38) * 0.2 + 0.2;
                        const noise = Math.random() * 0.06;

                        const raw = (wave1 + wave2 + noise) * (1.1 - centerDist * 0.65);
                        return 0.05 + clamp01(raw) * 0.95;
                    });

                    barsRef.current = barsRef.current.map(
                        (prev, i) => prev * 0.65 + next[i] * 0.35,
                    );
                    setBars([...barsRef.current]);
                } else {
                    // --- Standard Web Audio API Mode ---
                    analyser.getByteFrequencyData(data as any);
                    const usefulBins = Math.floor(data.length * 0.6);

                    const next = Array.from({ length: barCount }, (_, i) => {
                        const half = barCount / 2;
                        const centerDist =
                            i < half
                                ? (half - 1 - i) / (half - 1)
                                : (i - half) / (half - 1);

                        const binIndex = Math.floor(
                            Math.pow(centerDist, 1.5) * usefulBins,
                        );
                        const windowSize = Math.max(
                            1,
                            Math.floor(centerDist * 3),
                        );

                        let sum = 0;
                        let count = 0;
                        const start = Math.max(0, binIndex - windowSize);
                        const end = Math.min(
                            data!.length - 1,
                            binIndex + windowSize,
                        );
                        for (let j = start; j <= end; j++) {
                            sum += data![j];
                            count++;
                        }
                        const avg = count ? sum / count : 0;
                        const eqBoost = 1 + centerDist * 0.8;
                        const raw = (avg / 255) * eqBoost;
                        return 0.05 + clamp01(raw) * 0.95;
                    });

                    barsRef.current = barsRef.current.map(
                        (prev, i) => prev * 0.7 + next[i] * 0.3,
                    );
                    setBars([...barsRef.current]);
                }

                rafId = requestAnimationFrame(tick);
            };

            rafId = requestAnimationFrame(tick);

            const handlePlay = () => {
                if (cached && cached.audioCtx.state === 'suspended') {
                    cached.audioCtx.resume().catch(() => {});
                }
                cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(tick);
            };
            mediaEl.addEventListener('play', handlePlay);
            cleanupListener = () =>
                mediaEl?.removeEventListener('play', handlePlay);
        };
        ...
```

---

### 3. Dual-Resolution Thumbnail Pipeline for Crisp Mini Album Art
* **Target Files:**
  - [colorExtractor.ts](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/utils/colorExtractor.ts) (Add URL suffix upgrade helper)
  - [Panel.tsx](file:///C:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/components/Panel.tsx) (Update state & rendering)
* **Design Strategy:**
  1. We will add a helper `getHighResThumbnailUrl` to `colorExtractor.ts`. It takes a normal-resolution URL (e.g. YouTube Music player bar tiny `=w60-h60-l90-rj` thumbnail or standard YouTube video default image) and cleanly upgrades it:
     - For Google User Content (YT Music CDN), replaces `=w60-h60` with `=w544-h544` and `/w120-h120/` with `/w544-h544/` so that Google's servers dynamically serve a high-resolution version.
     - For standard YouTube video default images, maps `hqdefault.jpg` to `maxresdefault.jpg`.
  2. In `Panel.tsx`, we introduce a new state: `const [highResThumbnailUrl, setHighResThumbnailUrl] = useState<string | null>(null);`.
  3. When discovering track details, we extract the normal thumbnail URL and run it through `getHighResThumbnailUrl` to populate the high-res variant once.
  4. The normal `thumbnailUrl` continues to drive performance-critical color extraction (so we don't download multi-megabyte images in the background just to grab dominant colors).
  5. In Mini Mode rendering, we replace `thumbnailUrl` with `highResThumbnailUrl || thumbnailUrl` so that the large artwork container is perfectly crisp and high-definition.

#### Suffix-Upgrade Helper in `colorExtractor.ts`:
```typescript
/**
 * Upgrade a standard/low-res Google User Content or YouTube thumbnail URL 
 * into a high-resolution version (e.g. w544-h544 or maxresdefault).
 */
export function getHighResThumbnailUrl(url: string | null): string | null {
    if (!url) return null;

    // 1. YouTube Video Thumbnails
    if (url.includes('img.youtube.com') || url.includes('i.ytimg.com')) {
        return url.replace(/\/(default|hqdefault|mqdefault|sddefault)\.jpg/, '/maxresdefault.jpg');
    }

    // 2. Google User Content CDN URLs (YouTube Music Album Art)
    if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
        let upgraded = url.replace(/=w\d+-h\d+/, '=w544-h544');
        upgraded = upgraded.replace(/=s\d+/, '=s544');
        upgraded = upgraded.replace(/\/w\d+-h\d+\//, '/w544-h544/');
        upgraded = upgraded.replace(/\/s\d+\//, '/s544/');
        return upgraded;
    }

    return url;
}
```

#### State & Discovery update in `Panel.tsx`:
```typescript
    // Introduce dual-resolution states
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [highResThumbnailUrl, setHighResThumbnailUrl] = useState<string | null>(null);
    ...

    const updateThumbnailUrl = useCallback(() => {
        let normalUrl: string | null = null;

        // Try to query YouTube Music bar image
        const ytMusicThumb = document.querySelector(
            'ytmusic-player-bar img.image',
        ) as HTMLImageElement | null;
        if (ytMusicThumb?.src) {
            normalUrl = ytMusicThumb.src;
        } else {
            // Try to query main player art
            const ytMusicArt = document.querySelector(
                '.ytmusic-player img',
            ) as HTMLImageElement | null;
            if (ytMusicArt?.src) {
                normalUrl = ytMusicArt.src;
            } else {
                // Fallback to video ID
                const videoId = getVideoId();
                if (videoId) {
                    normalUrl = getThumbnailUrl(videoId);
                }
            }
        }

        if (normalUrl) {
            setThumbnailUrl(normalUrl);
            setHighResThumbnailUrl(getHighResThumbnailUrl(normalUrl));
        } else {
            setThumbnailUrl(null);
            setHighResThumbnailUrl(null);
        }
    }, []);
```

#### Mini Mode render override in `Panel.tsx`:
```tsx
                    <div className="spotify-artwork-card">
                        {/* Render the high-resolution version if available, falling back to normal */}
                        {(highResThumbnailUrl || thumbnailUrl) ? (
                            <img
                                src={highResThumbnailUrl || thumbnailUrl}
                                alt="Album Art"
                                className="spotify-album-art"
                                draggable="false"
                            />
                        ) : (
                            <AbstractThumbnail size={170} active={isVisible} />
                        )}
                        ...
```

---

## 📈 Verification Plan

### Automated Tests
* Perform a full typescript compilation and watch build check to ensure everything works flawlessly:
  ```bash
  npm run build
  ```

### Manual Verification
1. **i18n Storage Keys Test:**
   - Save or select lyrics for a standard Latin track. Verify that storage continues to use and preserve the existing cached format (`lyrics_coldplay_yellow`).
   - Save or select lyrics for a Japanese or Hindi track. Verify that storage successfully creates a secure, unique, URL-safe key (e.g. prefixed with `lyrics_i18n_...`) instead of collapsing into `lyrics__`, and that the cached lyrics are fetched successfully on next visit.
2. **Visualizer & Fallback Test:**
   - Simulate Web Audio creation failure (e.g. block mic/audio permissions or trigger context exception). Verify that the visualizer smoothly transitions to the procedural wave animation on playback instead of completely freezing at `0.05` height.
   - Verify that the player audio remains active and completely unmuted throughout the process.
3. **Crisp Mini Album Art Test:**
   - Put the player into **Mini Mode**.
   - Check the album artwork element. Inspect the image source and verify that it maps to a high-resolution suffix-upgraded URL (e.g. `=w544-h544...`) making the image perfectly sharp and high-definition instead of a pixelated `60x60` thumbnail.
   - Expand the player to Full Mode and verify that color extraction continues to operate efficiently using the lightweight normal-res thumbnail.
