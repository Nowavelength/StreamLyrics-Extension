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
}

/**
 * Hook for syncing lyrics with video playback
 * Uses requestAnimationFrame for 60fps precision
 * Handles pause/resume detection and timing offset
 */
export function useVideoSync(lines: LyricLine[]): UseVideoSyncResult {
    const [currentLineIndex, setCurrentLineIndex] = useState(-1);
    const [isPaused, setIsPaused] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [offset, setOffset] = useState(0); // Offset in seconds (positive = lyrics ahead, negative = lyrics behind)

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const lastLineIndexRef = useRef(-1);

    /**
     * Binary search to find the current line index
     * Applies offset to adjust timing
     */
    const findCurrentLineIndex = useCallback((time: number, currentOffset: number): number => {
        if (lines.length === 0) return -1;

        // Apply offset: positive offset means lyrics should appear earlier
        const adjustedTime = time + currentOffset;

        let left = 0;
        let right = lines.length - 1;
        let result = -1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);

            if (lines[mid].start <= adjustedTime) {
                result = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return result;
    }, [lines]);

    /**
     * Main sync loop using requestAnimationFrame
     */
    const syncLoop = useCallback(() => {
        const video = videoRef.current;

        if (video) {
            const time = video.currentTime;
            setCurrentTime(time);
            setIsPaused(video.paused);

            // Only update line index when not paused
            if (!video.paused) {
                setOffset(currentOffset => {
                    const newIndex = findCurrentLineIndex(time, currentOffset);

                    // Only trigger state update if index changed
                    if (newIndex !== lastLineIndexRef.current) {
                        lastLineIndexRef.current = newIndex;
                        setCurrentLineIndex(newIndex);
                    }
                    return currentOffset;
                });
            }
        }

        rafIdRef.current = requestAnimationFrame(syncLoop);
    }, [findCurrentLineIndex]);

    /**
     * Seek video to specific time
     */
    const seekTo = useCallback((time: number) => {
        const video = videoRef.current;
        if (video) {
            video.currentTime = time;
        }
    }, []);

    /**
     * Adjust offset by delta (in seconds)
     */
    const adjustOffset = useCallback((delta: number) => {
        setOffset(prev => {
            const newOffset = Math.round((prev + delta) * 10) / 10; // Round to 0.1s
            return Math.max(-120, Math.min(120, newOffset)); // Clamp to ±120s
        });
    }, []);

    /**
     * Reset offset to zero
     */
    const resetOffset = useCallback(() => {
        setOffset(0);
    }, []);

    /**
     * Find and attach to YouTube/YouTube Music video element
     */
    useEffect(() => {
        const findVideo = () => {
            // Try multiple selectors for YouTube and YouTube Music
            const selectors = [
                'video.html5-main-video',           // YouTube
                'video.video-stream',               // YouTube alternative
                '#movie_player video',              // YouTube player
                'ytmusic-player video',             // YouTube Music
                '#player video',                    // YouTube Music alternative
                'video'                             // Fallback - any video
            ];

            for (const selector of selectors) {
                const video = document.querySelector(selector) as HTMLVideoElement | null;
                if (video && video.src) {
                    videoRef.current = video;
                    console.log('[StreamLyrics] Found video element:', selector);
                    return true;
                }
            }
            return false;
        };

        // Try to find video immediately
        if (!findVideo()) {
            // Retry with observer if not found
            const observer = new MutationObserver(() => {
                if (findVideo()) {
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            return () => observer.disconnect();
        }
    }, []);

    /**
     * Start/stop sync loop based on video availability
     */
    useEffect(() => {
        if (lines.length > 0) {
            rafIdRef.current = requestAnimationFrame(syncLoop);
        }

        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, [lines, syncLoop]);

    /**
     * Handle video events for pause/play state
     */
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePause = () => setIsPaused(true);
        const handlePlay = () => setIsPaused(false);
        const handleSeeked = () => {
            setOffset(currentOffset => {
                const newIndex = findCurrentLineIndex(video.currentTime, currentOffset);
                lastLineIndexRef.current = newIndex;
                setCurrentLineIndex(newIndex);
                return currentOffset;
            });
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
    };
}
