import { LyricLine } from '../types';
import {
    getVideoId,
    getVideoTitle,
    cleanVideoTitle,
    NoTranscriptFoundError,
    TranscriptsDisabledError,
    VideoUnavailableError
} from '../utils/transcriptParser';
import { lrclibService } from './lrclibService';
import { lyricaService } from './lyricaService';
import { storageService } from './storageService';

export type LyricsSource = 'local' | 'youtube' | 'lyrica' | 'lrclib';

/**
 * Multi-Source Lyrics Service
 * Cascading strategy: YouTube (Backend) → Lyrica → LRCLIB
 */
export class TranscriptService {


    /**
     * Fetch lyrics from Lrclib only (first result)
     */
    async fetchFromLrclib(): Promise<LyricLine[] | null> {
        console.log('[StreamLyrics] Fetching from Lrclib...');
        const videoTitle = getVideoTitle();
        const lines = await lrclibService.searchByTitle(videoTitle);
        if (lines && lines.length > 0) {
            console.log('[StreamLyrics] Found Lrclib lyrics:', lines.length, 'lines');
            return lines;
        }
        return null;
    }

    /**
     * Fetch ALL matching lyrics from Lrclib (for alternative results)
     */
    async fetchAllFromLrclib(): Promise<LyricLine[][]> {
        console.log('[StreamLyrics] Fetching all results from Lrclib...');
        const videoTitle = getVideoTitle();
        const results = await lrclibService.searchAllByTitle(videoTitle);
        console.log('[StreamLyrics] Found', results.length, 'Lrclib results');
        return results;
    }

    /**
     * Fetch lyrics from Lyrica API
     */
    async fetchFromLyrica(): Promise<LyricLine[] | null> {
        console.log('[StreamLyrics] Fetching from Lyrica...');
        const { artist, track } = cleanVideoTitle(getVideoTitle());
        const lines = await lyricaService.fetchLyrics(artist, track);
        if (lines && lines.length > 0) {
            console.log('[StreamLyrics] Found Lyrica lyrics:', lines.length, 'lines');
            return lines;
        }
        return null;
    }


    /**
     * Fetch lyrics from local storage (highest priority)
     */
    async fetchFromStorage(): Promise<LyricLine[] | null> {
        console.log('[StreamLyrics] Checking local storage...');
        const { artist, track } = cleanVideoTitle(getVideoTitle());
        const lines = await storageService.getSavedLyrics(artist, track);
        if (lines && lines.length > 0) {
            console.log('[StreamLyrics] Found saved lyrics:', lines.length, 'lines');
            return lines;
        }
        return null;
    }

    /**
     * Fetch lyrics using waterfall approach across 3 sources
     * Priority: Local Storage → Lyrica → LRCLIB
     */
    async fetchLyrics(): Promise<{ lines: LyricLine[]; source: LyricsSource } | null> {
        console.log('[StreamLyrics] Starting multi-source lyrics fetch...');

        // 0. Local Storage (user saved lyrics)
        const localLines = await this.fetchFromStorage();
        if (localLines) {
            return { lines: localLines, source: 'local' };
        }

        // 1. Lyrica (strong Indian/Bollywood coverage)
        console.log('[StreamLyrics] Fetching from Lyrica...');
        const lyricaLines = await this.fetchFromLyrica();
        if (lyricaLines) {
            return { lines: lyricaLines, source: 'lyrica' };
        }

        // 2. LRCLIB (global crowd-sourced)
        console.log('[StreamLyrics] No Lyrica lyrics, trying LRCLIB...');
        const lrclibLines = await this.fetchFromLrclib();
        if (lrclibLines) {
            return { lines: lrclibLines, source: 'lrclib' };
        }

        console.log('[StreamLyrics] No lyrics found from any source');
        return null;
    }

    /**
     * Fetch YouTube's built-in captions (including auto-generated)
     * Now uses the Python backend server for reliability
     */
    private async fetchYouTubeTranscript(): Promise<LyricLine[] | null> {
        try {
            const videoId = getVideoId();
            if (!videoId) {
                console.log('[StreamLyrics] No video ID found');
                return null;
            }

            console.log('[StreamLyrics] Using video ID:', videoId);
            console.log('[StreamLyrics] Fetching from backend server...');

            try {
                // Use the backend server logic (Option B)
                const response = await fetch(`http://localhost:8000/transcript?video_id=${videoId}`);

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ detail: response.statusText }));
                    console.error('[StreamLyrics] Backend error:', error);

                    if (response.status === 404) {
                        throw new NoTranscriptFoundError(videoId);
                    }

                    throw new Error(`Backend error: ${error.detail || response.statusText}`);
                }

                const data = await response.json();

                if (data.transcript && Array.isArray(data.transcript)) {
                    console.log(`[StreamLyrics] Got ${data.transcript.length} lines from backend (${data.language})`);

                    return data.transcript.map((item: any) => ({
                        text: item.text,
                        startTime: item.start,
                        endTime: item.start + item.duration
                    }));
                }

                throw new Error('Invalid response format from backend');

            } catch (error) {
                console.error('[StreamLyrics] Backend fetch failed:', error);

                if (error instanceof NoTranscriptFoundError || error instanceof TranscriptsDisabledError || error instanceof VideoUnavailableError) {
                    throw error;
                }
                throw error;
            }
        } catch (error) {
            if (error instanceof TranscriptsDisabledError) {
                console.error('[StreamLyrics]', error.message);
            } else if (error instanceof NoTranscriptFoundError) {
                console.error('[StreamLyrics]', error.message);
            } else if (error instanceof VideoUnavailableError) {
                console.error('[StreamLyrics]', error.message);
            } else {
                console.error('[StreamLyrics] Error fetching YouTube transcript:', error);
            }
            return null;
        }
    }
}

export const transcriptService = new TranscriptService();
