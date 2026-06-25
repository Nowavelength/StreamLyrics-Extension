import { useEffect, useState, useRef } from 'react';
import { createAudioBarsDriver } from './audioBarsDriver';

/**
 * Audio Graph cache — bound to the DOM media element, NOT React lifecycle.
 *
 * YouTube reuses <video> elements across SPA navigations, and a
 * MediaElementAudioSourceNode can only be created once per element. Tying the
 * graph to the element lets us survive remounts without throwing.
 */
const audioGraphCache = new WeakMap<
    HTMLMediaElement,
    {
        audioCtx: AudioContext;
        analyser: AnalyserNode;
        source: MediaElementAudioSourceNode;
    }
>();

const TARGET_FPS = 30;
const FRAME_BUDGET_MS = 1000 / TARGET_FPS;

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

function findActiveVideo(): HTMLMediaElement | null {
    const selectors = [
        'video.html5-main-video',
        'video.video-stream',
        '#movie_player video',
        'ytmusic-player video',
        '#player video',
        'video',
    ];
    let bestVideo: HTMLMediaElement | null = null;
    let bestScore = -1;

    for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector)) as HTMLMediaElement[];
        for (const v of elements) {
            if (!v || !v.src || !v.isConnected) continue;

            let score = 0;
            score += 1;

            const rect = v.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                score += 10;
            }

            if (!v.paused) {
                score += 20;
            }

            if (!v.ended && v.currentTime > 0) {
                score += 5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestVideo = v;
            }
        }
    }
    return bestVideo;
}

export function useAudioBars(barCount = 32) {
    const [bars, setBars] = useState<number[]>(
        Array.from({ length: barCount }, () => 0.05),
    );
    const barsRef = useRef<number[]>(
        Array.from({ length: barCount }, () => 0.05),
    );
    const isProceduralRef = useRef(false);

    useEffect(() => {
        let rafId = 0;
        let analyser: AnalyserNode | null = null;
        let data: Uint8Array | null = null;
        let driver: ReturnType<typeof createAudioBarsDriver> | null = null;
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
                    newAnalyser.fftSize = 2048;
                    newAnalyser.smoothingTimeConstant = 0.55;

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
                        '[StreamLyrics] Audio graph could not be created; falling back to procedural waves:',
                        e,
                    );
                    isProceduralRef.current = true;
                }
            }

            const cached = audioGraphCache.get(mediaEl);
            if (cached) {
                analyser = cached.analyser;
                data = new Uint8Array(analyser.frequencyBinCount);
                driver = createAudioBarsDriver({
                    barCount,
                    sampleRate: cached.audioCtx.sampleRate,
                    fftSize: analyser.fftSize,
                });
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
                const deltaMs = lastFrame ? now - lastFrame : FRAME_BUDGET_MS;
                lastFrame = now;

                // Auto-resume if browser suspended the context.
                if (cached && cached.audioCtx.state === 'suspended' && !mediaEl.paused) {
                    cached.audioCtx.resume().catch(() => {});
                }

                if (mediaEl.paused) {
                    // Decay to baseline; stop scheduling once settled.
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

                if (isProceduralRef.current || !analyser || !data || !driver) {
                    // --- Procedural Fallback Mode ---
                    // Generates smooth, beautiful mirrored mock waves (bass center, treble edge)
                    const timeFactor = performance.now() * 0.0035;
                    const next = Array.from({ length: barCount }, (_, i) => {
                        const half = barCount / 2;
                        const centerDist =
                            i < half
                                ? (half - 1 - i) / (half - 1)
                                : (i - half) / (half - 1);

                        // Mirrored sine wave combination with slight dynamic noise
                        const wave1 = Math.sin(timeFactor + i * 0.22) * 0.35 + 0.35;
                        const wave2 = Math.cos(timeFactor * 0.73 - i * 0.38) * 0.2 + 0.2;
                        const noise = Math.random() * 0.06;

                        // Taper heights down toward the treble edges
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
                    barsRef.current = driver.process(data, deltaMs);
                    setBars([...barsRef.current]);
                }

                rafId = requestAnimationFrame(tick);
            };

            rafId = requestAnimationFrame(tick);

            // Wake the loop when the user resumes playback.
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

        const checkVideoChange = () => {
            const currentVideo = findActiveVideo();
            if (currentVideo && currentVideo !== mediaEl) {
                cancelAnimationFrame(rafId);
                cleanupListener?.();
                init();
            }
        };
        const intervalId = setInterval(checkVideoChange, 2500);

        init();

        return () => {
            isActive = false;
            cancelAnimationFrame(rafId);
            cleanupListener?.();
            clearInterval(intervalId);
            // Note: we deliberately do NOT close the AudioContext or
            // disconnect the graph. It belongs to the DOM node now.
        };
    }, [barCount]);

    return bars;
}
