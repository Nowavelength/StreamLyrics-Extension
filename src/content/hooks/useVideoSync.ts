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
    const [activeVideo, setActiveVideo] = useState<HTMLVideoElement | null>(null);

    const offsetRef = useRef(initialOffset);
    const linesRef = useRef<LyricLine[]>(lines);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const lastLineIndexRef = useRef(-1);
    const lastTimeUpdateRef = useRef(0);
    const trackStartOffsetRef = useRef(0);
    const lastDomTimeRef = useRef(-1);

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

            // Continuous self-correcting calibration against the DOM player progress
            const domTime = getDomTrackTime();
            if (domTime !== null) {
                if (domTime !== lastDomTimeRef.current) {
                    trackStartOffsetRef.current = time - domTime;
                    lastDomTimeRef.current = domTime;
                }
            } else {
                trackStartOffsetRef.current = 0;
                lastDomTimeRef.current = -1;
            }

            const trackTime = Math.max(0, time - trackStartOffsetRef.current);

            // Throttle currentTime + isPaused to 10 fps so the React tree
            // doesn't churn.
            if (now - lastTimeUpdateRef.current >= TIME_UPDATE_INTERVAL_MS) {
                lastTimeUpdateRef.current = now;
                setCurrentTime(trackTime);
                setIsPaused(video.paused);
            }

            const newIndex = findCurrentLineIndex(trackTime);
            if (newIndex !== lastLineIndexRef.current) {
                lastLineIndexRef.current = newIndex;
                setCurrentLineIndex(newIndex);
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

    // Track active video element (re-evaluate periodically in case YouTube swaps it).
    useEffect(() => {
        const findVideo = () => {
            const selectors = [
                'video.html5-main-video',
                'video.video-stream',
                '#movie_player video',
                'ytmusic-player video',
                '#player video',
                'video',
            ];
            let bestVideo: HTMLVideoElement | null = null;
            let bestScore = -10000;

            for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector)) as HTMLVideoElement[];
                for (const v of elements) {
                    if (!v || !v.src || !v.isConnected) continue;

                    let score = 0;
                    score += 1;

                    const rect = v.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        score += 10;
                    }

                    if (!v.paused) {
                        score += 100;
                    }

                    const isEnded = v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5);
                    if (isEnded) {
                        score -= 1000;
                    }

                    if (v.closest('ytmusic-player') || v.closest('#movie_player') || v.closest('.html5-video-player')) {
                        score += 50;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestVideo = v;
                    }
                }
            }

            if (bestVideo && bestVideo !== videoRef.current) {
                videoRef.current = bestVideo;
                setActiveVideo(bestVideo);
            }
        };

        findVideo();
        const interval = setInterval(findVideo, 1000); // Check every 1s for snappy tab updates

        const observer = new MutationObserver(() => {
            findVideo();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            clearInterval(interval);
            observer.disconnect();
        };
    }, []);

    // RAF loop lifecycle.
    useEffect(() => {
        lastLineIndexRef.current = -1;
        setCurrentLineIndex(-1);
        trackStartOffsetRef.current = 0;
        lastDomTimeRef.current = -1;

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
        const video = activeVideo;
        if (!video) return;

        const handlePause = () => setIsPaused(true);
        const handlePlay = () => setIsPaused(false);
        const handleSeeked = () => {
            const domTime = getDomTrackTime() || 0;
            const time = video.currentTime;
            trackStartOffsetRef.current = time - domTime;
            lastDomTimeRef.current = domTime;

            const trackTime = Math.max(0, time - trackStartOffsetRef.current);
            const newIndex = findCurrentLineIndex(trackTime);
            lastLineIndexRef.current = newIndex;
            setCurrentLineIndex(newIndex);
            setCurrentTime(trackTime);
        };

        video.addEventListener('pause', handlePause);
        video.addEventListener('play', handlePlay);
        video.addEventListener('seeked', handleSeeked);

        return () => {
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('seeked', handleSeeked);
        };
    }, [activeVideo, findCurrentLineIndex]);

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

function parseTimeToSeconds(timeStr: string): number {
    const cleanStr = timeStr.replace(/[^\d:]/g, '').trim();
    const parts = cleanStr.split(':').map(Number);
    if (parts.some(isNaN) || parts.length === 0) return 0;
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
}

function getDomTrackTime(): number | null {
    // YouTube Music selectors
    const ytmSelectors = [
        'ytmusic-player-bar .time-info',
        'ytmusic-player-bar #time-display',
        '.time-info.ytmusic-player-bar',
    ];
    for (const selector of ytmSelectors) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text && text.includes('/')) {
            const currentPart = text.split('/')[0];
            if (currentPart) {
                return parseTimeToSeconds(currentPart);
            }
        }
    }

    // YouTube selectors
    const ytSelectors = [
        '.ytp-time-current',
        '.ytp-time-display .ytp-time-current',
    ];
    for (const selector of ytSelectors) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) {
            return parseTimeToSeconds(text);
        }
    }

    return null;
}
