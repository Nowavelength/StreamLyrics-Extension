import { useState, useEffect, useCallback, useRef } from 'react';
import { LyricLine } from '../types';
import { transcriptService, LyricsSource } from '../services/transcriptService';
import { CurrentTrackInfo, getCurrentTrackInfo, getLyricsSearchTitle } from '../utils/transcriptParser';

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

/**
 * Hook for fetching lyrics with source switching and song change detection.
 * Once the extension is activated, this keeps watching the playing track even
 * when the lyrics panel is hidden or rendered in the popout window.
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

    const loadLrclibAlternatives = useCallback((rawTitle: string, trackInfo: CurrentTrackInfo, fetchId: number) => {
        transcriptService.fetchAllFromLrclib(rawTitle, trackInfo).then((lrcResults) => {
            if (fetchId !== fetchIdRef.current || !lrcResults || lrcResults.length === 0) {
                return;
            }

            setAllLrclibResults(lrcResults);
            setLrclibLines(lrcResults[0]);
            setAvailableSources((prev) => prev.includes('lrclib') ? prev : [...prev, 'lrclib']);
        }).catch(() => { });
    }, []);

    const fetchLyrics = useCallback(async (
        force: boolean = false,
        manualInfo?: Pick<CurrentTrackInfo, 'rawTitle' | 'title' | 'artist'>
    ) => {
        const detectedTrackInfo = getCurrentTrackInfo();
        const trackInfo = manualInfo
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

        if (!searchTitle || searchTitle.length < 2) {
            return;
        }

        if (!force && signature === lastFetchedSignatureRef.current && linesRef.current.length > 0) {
            console.log('[StreamLyrics] Same track, skipping fetch');
            return;
        }

        const fetchId = fetchIdRef.current + 1;
        fetchIdRef.current = fetchId;
        lastFetchedSignatureRef.current = signature;
        lastSeenSignatureRef.current = signature;

        setCurrentTitle(trackInfo.artist ? `${trackInfo.artist} - ${trackInfo.title}` : trackInfo.title);
        setIsLoading(true);
        setError(null);
        setLines([]);
        setSource(null);
        setLrclibLines(null);
        setAvailableSources([]);
        setLrclibResultIndex(0);
        setAllLrclibResults([]);

        console.log('[StreamLyrics] Fetching lyrics for:', searchTitle);

        try {
            const handlePartialResult = (partial: any) => {
                if (fetchId !== fetchIdRef.current) return;
                
                setLines(partial.lines);
                setSource(partial.source);
                setIsLoading(false);
                setAvailableSources(prev => prev.includes(partial.source) ? prev : [...prev, partial.source]);
                
                if (partial.offset) {
                    setInitialOffset(partial.offset);
                }
            };

            const result = await transcriptService.fetchLyrics(rawTitle, trackInfo, handlePartialResult);

            if (fetchId !== fetchIdRef.current) {
                console.log('[StreamLyrics] Ignoring stale lyrics response');
                return;
            }

            if (result) {
                // Ensure final state is correct, though partial might have already set it
                setLines(result.lines);
                setSource(result.source);
                setAvailableSources(prev => prev.includes(result.source) ? prev : [...prev, result.source]);
                
                if (result.offset) {
                    setInitialOffset(result.offset);
                }

                if (result.alternatives && result.alternatives.length > 0) {
                    setAllLrclibResults(result.alternatives);
                    setLrclibLines(result.alternatives[0]);
                    setAvailableSources((prev) => prev.includes('lrclib') ? prev : [...prev, 'lrclib']);
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
            if (fetchId !== fetchIdRef.current) {
                return;
            }

            console.error('[StreamLyrics] Error fetching transcript:', err);
            setError('Failed to fetch lyrics');
            setLines([]);
        } finally {
            if (fetchId === fetchIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [loadLrclibAlternatives]);

    const scheduleTrackCheck = useCallback((reason: string) => {
        const trackInfo = getCurrentTrackInfo();
        const searchTitle = getLyricsSearchTitle(trackInfo);
        const signature = trackInfo.signature || searchTitle.toLowerCase().trim();

        if (!signature || searchTitle.length < 2) {
            return;
        }

        if (!lastSeenSignatureRef.current) {
            lastSeenSignatureRef.current = signature;
        }

        if (!lastFetchedSignatureRef.current) {
            return;
        }

        if (signature === lastSeenSignatureRef.current && signature === lastFetchedSignatureRef.current) {
            return;
        }

        console.log('[StreamLyrics] Song changed:', reason, searchTitle);
        lastSeenSignatureRef.current = signature;

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            fetchLyrics(true);
        }, SONG_CHANGE_DEBOUNCE_MS);
    }, [fetchLyrics]);

    const switchSource = useCallback((newSource: LyricsSource) => {
        if (newSource === 'lrclib' && lrclibLines) {
            setLines(lrclibLines);
            setSource('lrclib');
        } else if (newSource === 'local') {
            const searchTitle = getLyricsSearchTitle(getCurrentTrackInfo());
            transcriptService.fetchFromStorage(searchTitle).then((localData) => {
                if (localData) {
                    setLines(localData.lines);
                    setSource('local');
                    if (localData.offset) {
                        setInitialOffset(localData.offset);
                    }
                }
            });
        }
    }, [lrclibLines]);

    const tryNextResult = useCallback(() => {
        if (allLrclibResults.length <= 1) return;

        const nextIndex = (lrclibResultIndex + 1) % allLrclibResults.length;
        setLrclibResultIndex(nextIndex);
        setLrclibLines(allLrclibResults[nextIndex]);
        setLines(allLrclibResults[nextIndex]);
        setSource('lrclib');

        console.log(`[StreamLyrics] Switched to result ${nextIndex + 1}/${allLrclibResults.length}`);
    }, [allLrclibResults, lrclibResultIndex]);

    useEffect(() => {
        const timer = setTimeout(() => fetchLyrics(true), 1000);
        return () => clearTimeout(timer);
    }, [fetchLyrics]);

    useEffect(() => {
        const interval = setInterval(() => scheduleTrackCheck('poll'), 1500);

        const handleVisibilityOrFocus = () => scheduleTrackCheck('visibility/focus');
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);
        window.addEventListener('pageshow', handleVisibilityOrFocus);

        let observerTimer: ReturnType<typeof setTimeout> | null = null;
        const observer = new MutationObserver(() => {
            if (observerTimer) {
                clearTimeout(observerTimer);
            }

            observerTimer = setTimeout(() => scheduleTrackCheck('dom'), 300);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        const videoListeners = ['loadedmetadata', 'durationchange', 'emptied', 'play', 'playing', 'canplay'];
        let attachedVideo: HTMLVideoElement | null = null;
        let detachVideo = () => { };

        const attachToCurrentVideo = () => {
            const video = document.querySelector('video') as HTMLVideoElement | null;
            if (!video || video === attachedVideo) {
                return;
            }

            detachVideo();
            attachedVideo = video;
            const handler = () => scheduleTrackCheck('media');
            videoListeners.forEach((eventName) => video.addEventListener(eventName, handler));
            detachVideo = () => {
                videoListeners.forEach((eventName) => video.removeEventListener(eventName, handler));
            };
        };

        attachToCurrentVideo();
        const videoInterval = setInterval(attachToCurrentVideo, 2000);

        return () => {
            clearInterval(interval);
            clearInterval(videoInterval);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('focus', handleVisibilityOrFocus);
            window.removeEventListener('pageshow', handleVisibilityOrFocus);
            observer.disconnect();
            detachVideo();

            if (observerTimer) {
                clearTimeout(observerTimer);
            }

            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
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
            if (!cleanTrack) {
                return;
            }

            fetchLyrics(true, {
                rawTitle: cleanArtist ? `${cleanArtist} - ${cleanTrack}` : cleanTrack,
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
