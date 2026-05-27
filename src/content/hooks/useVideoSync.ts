import { useState, useEffect, useRef, useCallback } from 'react';
import { LyricLine } from '../types';

interface UseVideoSyncResult {
    currentLineIndex: number;
    isPaused: boolean;
    currentTime: number;
    offset: number;
    seekTo: (time: number) => void;
    adjustOffset: (delta: number) => void;
    resetOffset: () => void;
    togglePlayPause: () => void;
    setLineIndex: (index: number) => void;
}

const TIME_UPDATE_INTERVAL_MS = 100; // throttle currentTime React updates to 10 fps

/**
 * Sync the lyrics highlight state with YouTube's <video> element.
 *
 * Uses requestAnimationFrame for the line-index search but throttles the
 * currentTime React state to avoid 60 fps re-renders.
 */
export function useVideoSync(
    lines: LyricLine[],
    initialOffset: number = 0,
): UseVideoSyncResult {
    const [currentLineIndex, setCurrentLineIndex] = useState(-1);
    const [isPaused, setIsPaused] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [offset, setOffsetState] = useState(initialOffset);

    const offsetRef = useRef(initialOffset);
    const linesRef = useRef<LyricLine[]>(lines);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const lastLineIndexRef = useRef(-1);
    const lastTimeUpdateRef = useRef(0);

    useEffect(() => {
        offsetRef.current = initialOffset;
        setOffsetState(initialOffset);
    }, [initialOffset]);

    useEffect(() => {
        linesRef.current = lines;
    }, [lines]);

    const findCurrentLineIndex = useCallback((time: number): number => {
        const ls = linesRef.current;
        if (ls.length === 0) return -1;
        const adjusted = time + offsetRef.current;

        let left = 0;
        let right = ls.length - 1;
        let result = -1;
        while (left <= right) {
            const mid = (left + right) >> 1;
            if (ls[mid].start <= adjusted) {
                result = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return result;
    }, []);

    const syncLoop = useCallback(() => {
        const video = videoRef.current;
        if (video) {
            const time = video.currentTime;
            const now = performance.now();

            // Throttle currentTime + isPaused to 10 fps so the React tree
            // doesn't churn.
            if (now - lastTimeUpdateRef.current >= TIME_UPDATE_INTERVAL_MS) {
                lastTimeUpdateRef.current = now;
                setCurrentTime(time);
                setIsPaused(video.paused);
            }

            if (!video.paused) {
                const newIndex = findCurrentLineIndex(time);
                if (newIndex !== lastLineIndexRef.current) {
                    lastLineIndexRef.current = newIndex;
                    setCurrentLineIndex(newIndex);
                }
            }
        }
        rafIdRef.current = requestAnimationFrame(syncLoop);
    }, [findCurrentLineIndex]);

    const seekTo = useCallback((time: number) => {
        const video = videoRef.current;
        if (video) video.currentTime = time;
    }, []);

    const adjustOffset = useCallback((delta: number) => {
        setOffsetState((prev) => {
            const next = clamp(roundTo1(prev + delta), -120, 120);
            offsetRef.current = next;
            return next;
        });
    }, []);

    const resetOffset = useCallback(() => {
        offsetRef.current = 0;
        setOffsetState(0);
    }, []);

    const togglePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
    }, []);

    const setLineIndex = useCallback((index: number) => {
        lastLineIndexRef.current = index;
        setCurrentLineIndex(index);
    }, []);

    // Find video element (with retry via observer).
    useEffect(() => {
        const findVideo = (): boolean => {
            const selectors = [
                'video.html5-main-video',
                'video.video-stream',
                '#movie_player video',
                'ytmusic-player video',
                '#player video',
                'video',
            ];
            for (const selector of selectors) {
                const v = document.querySelector(selector) as HTMLVideoElement | null;
                if (v && v.src) {
                    videoRef.current = v;
                    return true;
                }
            }
            return false;
        };

        if (!findVideo()) {
            const observer = new MutationObserver(() => {
                if (findVideo()) observer.disconnect();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            return () => observer.disconnect();
        }
    }, []);

    // RAF loop lifecycle.
    useEffect(() => {
        lastLineIndexRef.current = -1;
        setCurrentLineIndex(-1);

        if (lines.length > 0) {
            rafIdRef.current = requestAnimationFrame(syncLoop);
        }
        return () => {
            if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
        };
    }, [lines, syncLoop]);

    // Video pause/play/seeked event handlers — keep state in sync immediately
    // (don't wait for the throttled RAF tick).
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePause = () => setIsPaused(true);
        const handlePlay = () => setIsPaused(false);
        const handleSeeked = () => {
            const newIndex = findCurrentLineIndex(video.currentTime);
            lastLineIndexRef.current = newIndex;
            setCurrentLineIndex(newIndex);
            setCurrentTime(video.currentTime);
        };

        video.addEventListener('pause', handlePause);
        video.addEventListener('play', handlePlay);
        video.addEventListener('seeked', handleSeeked);

        return () => {
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('seeked', handleSeeked);
        };
    }, [findCurrentLineIndex]);

    return {
        currentLineIndex,
        isPaused,
        currentTime,
        offset,
        seekTo,
        adjustOffset,
        resetOffset,
        togglePlayPause,
        setLineIndex,
    };
}

function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
}
function roundTo1(v: number) {
    return Math.round(v * 10) / 10;
}
