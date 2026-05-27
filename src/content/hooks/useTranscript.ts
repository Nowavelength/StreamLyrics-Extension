import { useState, useEffect, useCallback, useRef } from 'react';
import { LyricLine } from '../types';
import { transcriptService, LyricsSource } from '../services/transcriptService';
import {
    CurrentTrackInfo,
    getCurrentTrackInfo,
    getLyricsSearchTitle,
} from '../utils/transcriptParser';

interface UseTranscriptResult {
    lines: LyricLine[];
    isLoading: boolean;
    error: string | null;
    source: LyricsSource | null;
    availableSources: LyricsSource[];
    currentTitle: string;
    refetch: () => void;
    searchManual: (artist: string, track: string) => void;
    switchSource: (source: LyricsSource) => void;
    tryNextResult: () => void;
    hasMoreResults: boolean;
    initialOffset: number;
}

const SONG_CHANGE_DEBOUNCE_MS = 450;
const POLL_INTERVAL_MS = 2_500;
const VIDEO_REATTACH_INTERVAL_MS = 4_000;

/**
 * Drives the lyrics fetch loop. Handles:
 *   - Initial fetch on mount
 *   - Song change detection (DOM observer + interval poll + media events)
 *   - Manual search override
 *   - LRCLIB alternates / next result cycling
 */
export function useTranscript(): UseTranscriptResult {
    const [lines, setLines] = useState<LyricLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<LyricsSource | null>(null);
    const [availableSources, setAvailableSources] = useState<LyricsSource[]>([]);
    const [currentTitle, setCurrentTitle] = useState('');
    const [lrclibResultIndex, setLrclibResultIndex] = useState(0);
    const [allLrclibResults, setAllLrclibResults] = useState<LyricLine[][]>([]);
    const [lrclibLines, setLrclibLines] = useState<LyricLine[] | null>(null);
    const [initialOffset, setInitialOffset] = useState(0);

    const linesRef = useRef<LyricLine[]>([]);
    const fetchIdRef = useRef(0);
    const lastFetchedSignatureRef = useRef('');
    const lastSeenSignatureRef = useRef('');
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        linesRef.current = lines;
    }, [lines]);

    const loadLrclibAlternatives = useCallback(
        (rawTitle: string, trackInfo: CurrentTrackInfo, fetchId: number) => {
            transcriptService
                .fetchAllFromLrclib(rawTitle, trackInfo)
                .then((lrcResults) => {
                    if (
                        fetchId !== fetchIdRef.current ||
                        !lrcResults ||
                        lrcResults.length === 0
                    ) {
                        return;
                    }
                    setAllLrclibResults(lrcResults);
                    setLrclibLines(lrcResults[0]);
                    setAvailableSources((prev) =>
                        prev.includes('lrclib') ? prev : [...prev, 'lrclib'],
                    );
                })
                .catch(() => {
                    /* silent */
                });
        },
        [],
    );

    const fetchLyrics = useCallback(
        async (
            force: boolean = false,
            manualInfo?: Pick<CurrentTrackInfo, 'rawTitle' | 'title' | 'artist'>,
        ) => {
            const detectedTrackInfo = getCurrentTrackInfo();
            const trackInfo: CurrentTrackInfo = manualInfo
                ? {
                      ...detectedTrackInfo,
                      rawTitle: manualInfo.rawTitle,
                      title: manualInfo.title,
                      artist: manualInfo.artist,
                      signature: `manual|${manualInfo.artist.toLowerCase()}|${manualInfo.title.toLowerCase()}`,
                  }
                : detectedTrackInfo;
            const searchTitle = getLyricsSearchTitle(trackInfo);
            const rawTitle = trackInfo.rawTitle || searchTitle;
            const signature = trackInfo.signature || searchTitle.toLowerCase().trim();

            if (!searchTitle || searchTitle.length < 2) return;

            if (
                !force &&
                signature === lastFetchedSignatureRef.current &&
                linesRef.current.length > 0
            ) {
                return;
            }

            const fetchId = fetchIdRef.current + 1;
            fetchIdRef.current = fetchId;
            lastFetchedSignatureRef.current = signature;
            lastSeenSignatureRef.current = signature;

            setCurrentTitle(
                trackInfo.artist
                    ? `${trackInfo.artist} - ${trackInfo.title}`
                    : trackInfo.title,
            );
            setIsLoading(true);
            setError(null);
            setLines([]);
            setSource(null);
            setLrclibLines(null);
            setAvailableSources([]);
            setLrclibResultIndex(0);
            setAllLrclibResults([]);
            // Reset offset on track change so a previous track's offset
            // doesn't bleed in. (Bug fix: was using `if (result.offset)` which
            // skipped the valid value 0.)
            setInitialOffset(0);

            try {
                const handlePartialResult = (partial: any) => {
                    if (fetchId !== fetchIdRef.current) return;
                    setLines(partial.lines);
                    setSource(partial.source);
                    setIsLoading(false);
                    setAvailableSources((prev) =>
                        prev.includes(partial.source) ? prev : [...prev, partial.source],
                    );
                    if (typeof partial.offset === 'number') {
                        setInitialOffset(partial.offset);
                    }
                };

                const result = await transcriptService.fetchLyrics(
                    rawTitle,
                    trackInfo,
                    handlePartialResult,
                );
                if (fetchId !== fetchIdRef.current) return;

                if (result) {
                    setLines(result.lines);
                    setSource(result.source);
                    setAvailableSources((prev) =>
                        prev.includes(result.source) ? prev : [...prev, result.source],
                    );
                    if (typeof result.offset === 'number') {
                        setInitialOffset(result.offset);
                    }
                    if (result.alternatives && result.alternatives.length > 0) {
                        setAllLrclibResults(result.alternatives);
                        setLrclibLines(result.alternatives[0]);
                        setAvailableSources((prev) =>
                            prev.includes('lrclib') ? prev : [...prev, 'lrclib'],
                        );
                    }
                    if (result.source === 'local') {
                        loadLrclibAlternatives(rawTitle, trackInfo, fetchId);
                    }
                    if (result.source === 'lrclib' && !result.alternatives) {
                        setLrclibLines(result.lines);
                        loadLrclibAlternatives(rawTitle, trackInfo, fetchId);
                    }
                } else {
                    setLines([]);
                    setSource(null);
                    setError('No lyrics found from any source');
                }
            } catch (err) {
                if (fetchId !== fetchIdRef.current) return;
                console.error('[StreamLyrics] Error fetching transcript:', err);
                setError('Failed to fetch lyrics');
                setLines([]);
            } finally {
                if (fetchId === fetchIdRef.current) setIsLoading(false);
            }
        },
        [loadLrclibAlternatives],
    );

    const scheduleTrackCheck = useCallback(
        (reason: string) => {
            const trackInfo = getCurrentTrackInfo();
            const searchTitle = getLyricsSearchTitle(trackInfo);
            const signature =
                trackInfo.signature || searchTitle.toLowerCase().trim();

            if (!signature || searchTitle.length < 2) return;
            if (!lastSeenSignatureRef.current) {
                lastSeenSignatureRef.current = signature;
            }
            // If we never managed an initial fetch (e.g. metadata wasn't
            // available at mount time), kick one off the moment we see a real
            // signature. Don't wait for the debounce.
            if (!lastFetchedSignatureRef.current) {
                fetchLyrics(true);
                return;
            }
            if (
                signature === lastSeenSignatureRef.current &&
                signature === lastFetchedSignatureRef.current
            ) {
                return;
            }

            console.log('[StreamLyrics] Song changed:', reason, searchTitle);
            lastSeenSignatureRef.current = signature;

            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(
                () => fetchLyrics(true),
                SONG_CHANGE_DEBOUNCE_MS,
            );
        },
        [fetchLyrics],
    );

    const switchSource = useCallback(
        (newSource: LyricsSource) => {
            if (newSource === 'lrclib' && lrclibLines) {
                setLines(lrclibLines);
                setSource('lrclib');
                return;
            }
            if (newSource === 'local') {
                const searchTitle = getLyricsSearchTitle(getCurrentTrackInfo());
                transcriptService.fetchFromStorage(searchTitle).then((localData) => {
                    if (!localData) return;
                    setLines(localData.lines);
                    setSource('local');
                    if (typeof localData.offset === 'number') {
                        setInitialOffset(localData.offset);
                    }
                });
            }
        },
        [lrclibLines],
    );

    const tryNextResult = useCallback(() => {
        if (allLrclibResults.length <= 1) return;
        const nextIndex = (lrclibResultIndex + 1) % allLrclibResults.length;
        setLrclibResultIndex(nextIndex);
        setLrclibLines(allLrclibResults[nextIndex]);
        setLines(allLrclibResults[nextIndex]);
        setSource('lrclib');
    }, [allLrclibResults, lrclibResultIndex]);

    // Initial fetch with quick backoff retries — YouTube sometimes hasn't
    // populated track metadata yet when the panel mounts. We try right away,
    // and if there's no metadata available we retry on a tight schedule
    // (50ms, 150ms, 350ms, 700ms, 1.2s, 2s) until something appears.
    useEffect(() => {
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const delays = [50, 150, 350, 700, 1200, 2000];
        let attempt = 0;

        const tryFetch = () => {
            if (cancelled) return;
            const trackInfo = getCurrentTrackInfo();
            const searchTitle = getLyricsSearchTitle(trackInfo);
            if (searchTitle && searchTitle.length >= 2) {
                fetchLyrics(true);
                return;
            }
            if (attempt >= delays.length) return;
            const delay = delays[attempt++];
            timeoutId = setTimeout(tryFetch, delay);
        };

        tryFetch();
        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [fetchLyrics]);

    // Track-change detection: a single MutationObserver + a slow interval +
    // media events. Visibility/focus events are no longer needed because the
    // observer covers all soft navigations.
    useEffect(() => {
        const interval = setInterval(
            () => scheduleTrackCheck('poll'),
            POLL_INTERVAL_MS,
        );

        let observerTimer: ReturnType<typeof setTimeout> | null = null;
        const observer = new MutationObserver(() => {
            if (observerTimer) clearTimeout(observerTimer);
            observerTimer = setTimeout(() => scheduleTrackCheck('dom'), 300);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        const videoListeners = [
            'loadedmetadata',
            'durationchange',
            'emptied',
            'play',
            'playing',
            'canplay',
        ];
        let attachedVideo: HTMLVideoElement | null = null;
        let detachVideo = () => {};

        const attachToCurrentVideo = () => {
            const video = document.querySelector('video') as HTMLVideoElement | null;
            if (!video || video === attachedVideo) return;
            detachVideo();
            attachedVideo = video;
            const handler = () => scheduleTrackCheck('media');
            videoListeners.forEach((evt) => video.addEventListener(evt, handler));
            detachVideo = () => {
                videoListeners.forEach((evt) => video.removeEventListener(evt, handler));
            };
        };

        attachToCurrentVideo();
        const videoInterval = setInterval(
            attachToCurrentVideo,
            VIDEO_REATTACH_INTERVAL_MS,
        );

        return () => {
            clearInterval(interval);
            clearInterval(videoInterval);
            observer.disconnect();
            detachVideo();
            if (observerTimer) clearTimeout(observerTimer);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [scheduleTrackCheck]);

    return {
        lines,
        isLoading,
        error,
        source,
        availableSources,
        currentTitle,
        refetch: () => fetchLyrics(true),
        searchManual: (artist: string, track: string) => {
            const cleanArtist = artist.trim();
            const cleanTrack = track.trim();
            if (!cleanTrack) return;
            fetchLyrics(true, {
                rawTitle: cleanArtist
                    ? `${cleanArtist} - ${cleanTrack}`
                    : cleanTrack,
                title: cleanTrack,
                artist: cleanArtist,
            });
        },
        switchSource,
        tryNextResult,
        hasMoreResults: allLrclibResults.length > 1,
        initialOffset,
    };
}
