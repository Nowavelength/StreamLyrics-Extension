import { useState, useEffect, useCallback, useRef } from 'react';
import { LyricLine } from '../types';
import { transcriptService, LyricsSource } from '../services/transcriptService';
import { getVideoTitle } from '../utils/transcriptParser';

interface UseTranscriptResult {
    lines: LyricLine[];
    isLoading: boolean;
    error: string | null;
    source: LyricsSource | null;
    availableSources: LyricsSource[];
    currentTitle: string;
    refetch: () => void;
    switchSource: (source: LyricsSource) => void;
    tryNextResult: () => void;
    hasMoreResults: boolean;
}

/**
 * Hook for fetching lyrics with source switching and song change detection
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

    // Cache for sources
    const [lrclibLines, setLrclibLines] = useState<LyricLine[] | null>(null);

    // Track last fetched title to avoid duplicate fetches
    const lastFetchedTitle = useRef<string>('');

    const fetchLyrics = useCallback(async (force: boolean = false) => {
        const title = getVideoTitle();

        // Skip if same title as last fetch (unless forced)
        if (!force && title === lastFetchedTitle.current && lines.length > 0) {
            console.log('[StreamLyrics] Same title, skipping fetch');
            return;
        }

        lastFetchedTitle.current = title;
        setCurrentTitle(title);
        setIsLoading(true);
        setError(null);
        setLrclibLines(null);
        setAvailableSources([]);
        setLrclibResultIndex(0);
        setAllLrclibResults([]);

        console.log('[StreamLyrics] Fetching lyrics for:', title);

        try {
            // Use new cascading multi-source fetch
            const result = await transcriptService.fetchLyrics();

            if (result) {
                setLines(result.lines);
                setSource(result.source);
                setAvailableSources([result.source]);

                // Cache result based on source
                if (result.source === 'local') {
                    // Even if we found local lyrics, fetch others in background so user can switch
                    transcriptService.fetchAllFromLrclib().then(lrcResults => {
                        if (lrcResults && lrcResults.length > 0) {
                            setAllLrclibResults(lrcResults);
                            setLrclibLines(lrcResults[0]);
                            setAvailableSources(prev => prev.includes('lrclib') ? prev : [...prev, 'lrclib']);
                        }
                    }).catch(() => { });
                }

                // For LRCLIB, try to get all results for cycling
                if (result.source === 'lrclib') {
                    setLrclibLines(result.lines);
                    transcriptService.fetchAllFromLrclib().then(lrcResults => {
                        if (lrcResults && lrcResults.length > 0) {
                            setAllLrclibResults(lrcResults);
                        }
                    }).catch(() => { });
                }

                // For Lyrica, fetch LRCLIB alternatives in background
                if (result.source === 'lyrica') {
                    transcriptService.fetchAllFromLrclib().then(lrcResults => {
                        if (lrcResults && lrcResults.length > 0) {
                            setAllLrclibResults(lrcResults);
                            setLrclibLines(lrcResults[0]);
                            setAvailableSources(prev => prev.includes('lrclib') ? prev : [...prev, 'lrclib']);
                        }
                    }).catch(() => { });
                }
            } else {
                setLines([]);
                setSource(null);
                setError('No lyrics found from any source');
            }
        } catch (err) {
            console.error('[StreamLyrics] Error fetching transcript:', err);
            setError('Failed to fetch lyrics');
            setLines([]);
        } finally {
            setIsLoading(false);
        }
    }, [lines.length]);

    /**
     * Switch to a different lyrics source
     */
    const switchSource = useCallback((newSource: LyricsSource) => {
        if (newSource === 'lrclib' && lrclibLines) {
            setLines(lrclibLines);
            setSource('lrclib');
        } else if (newSource === 'local') {
            // Re-fetch from storage to ensure we have the latest
            transcriptService.fetchFromStorage().then(localLines => {
                if (localLines) {
                    setLines(localLines);
                    setSource('local');
                }
            });
        }
    }, [lrclibLines]);

    /**
     * Try the next Lrclib result (for when wrong song is matched)
     */
    const tryNextResult = useCallback(() => {
        if (allLrclibResults.length <= 1) return;

        const nextIndex = (lrclibResultIndex + 1) % allLrclibResults.length;
        setLrclibResultIndex(nextIndex);
        setLrclibLines(allLrclibResults[nextIndex]);

        if (source === 'lrclib') {
            setLines(allLrclibResults[nextIndex]);
        }

        console.log(`[StreamLyrics] Switched to result ${nextIndex + 1}/${allLrclibResults.length}`);
    }, [allLrclibResults, lrclibResultIndex, source]);

    // Initial fetch
    useEffect(() => {
        const timer = setTimeout(fetchLyrics, 1000);
        return () => clearTimeout(timer);
    }, [fetchLyrics]);

    // Detect song changes via stable interval checking (not MutationObserver)
    // MutationObserver fires too often on YT Music causing glitchy reloads
    useEffect(() => {
        let lastCheckedTitle = currentTitle;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const interval = setInterval(() => {
            const newTitle = getVideoTitle();

            // Only refetch if title actually changed and is different from what we fetched
            if (newTitle &&
                newTitle !== lastCheckedTitle &&
                newTitle !== lastFetchedTitle.current &&
                newTitle.length > 3) { // Ignore very short titles (loading states)

                console.log('[StreamLyrics] Song changed:', newTitle);
                lastCheckedTitle = newTitle;

                // Debounce: clear any pending fetch and schedule a new one
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    lastFetchedTitle.current = '';
                    fetchLyrics(true); // Force refetch for new song
                }, 500); // Wait 500ms to ensure title is stable
            }
        }, 1500); // Check every 1.5 seconds

        return () => {
            clearInterval(interval);
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    }, [fetchLyrics, currentTitle]);

    return {
        lines,
        isLoading,
        error,
        source,
        availableSources,
        currentTitle,
        refetch: fetchLyrics,
        switchSource,
        tryNextResult,
        hasMoreResults: allLrclibResults.length > 1,
    };
}
