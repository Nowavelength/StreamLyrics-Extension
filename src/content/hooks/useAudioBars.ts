import { useEffect, useState, useRef } from 'react';

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

export function useAudioBars(barCount = 32) {
    const [bars, setBars] = useState<number[]>(
        Array.from({ length: barCount }, () => 0.05),
    );
    const barsRef = useRef<number[]>(
        Array.from({ length: barCount }, () => 0.05),
    );

    useEffect(() => {
        let rafId = 0;
        let analyser: AnalyserNode | null = null;
        let data: Uint8Array | null = null;
        let mediaEl: HTMLMediaElement | null = null;
        let isActive = true;
        let lastFrame = 0;
        let cleanupListener: (() => void) | null = null;

        const init = () => {
            mediaEl = document.querySelector(
                'video.html5-main-video, video',
            ) as HTMLMediaElement | null;

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
                } catch (e) {
                    console.warn(
                        '[StreamLyrics] Audio graph could not be created (falling back to procedural):',
                        e,
                    );
                    return;
                }
            }

            const cached = audioGraphCache.get(mediaEl)!;
            analyser = cached.analyser;
            data = new Uint8Array(analyser.frequencyBinCount);

            const tick = (now: number) => {
                if (!isActive || !analyser || !data || !mediaEl) return;

                // FPS gate.
                if (now - lastFrame < FRAME_BUDGET_MS) {
                    rafId = requestAnimationFrame(tick);
                    return;
                }
                lastFrame = now;

                // Auto-resume if browser suspended the context.
                if (cached.audioCtx.state === 'suspended' && !mediaEl.paused) {
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

                rafId = requestAnimationFrame(tick);
            };

            rafId = requestAnimationFrame(tick);

            // Wake the loop when the user resumes playback.
            const handlePlay = () => {
                if (cached.audioCtx.state === 'suspended') {
                    cached.audioCtx.resume().catch(() => {});
                }
                cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(tick);
            };
            mediaEl.addEventListener('play', handlePlay);
            cleanupListener = () =>
                mediaEl?.removeEventListener('play', handlePlay);
        };

        init();

        return () => {
            isActive = false;
            cancelAnimationFrame(rafId);
            cleanupListener?.();
            // Note: we deliberately do NOT close the AudioContext or
            // disconnect the graph. It belongs to the DOM node now.
        };
    }, [barCount]);

    return bars;
}
