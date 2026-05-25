import { LyricLine } from '../types';
import {
    CurrentTrackInfo,
    cleanVideoTitle,
    getLyricsSearchCandidates,
    getVideoTitle,
} from '../utils/transcriptParser';
import { lrclibService } from './lrclibService';
import { storageService } from './storageService';

export type LyricsSource = 'local' | 'lrclib';

export interface LyricsFetchResult {
    lines: LyricLine[];
    source: LyricsSource;
    alternatives?: LyricLine[][];
    offset?: number;
    isPreferred?: boolean;
}

/**
 * Multi-Source Lyrics Service
 * Cascading strategy: Local saved lyrics -> LRCLIB
 */
export class TranscriptService {
    /**
     * Fetch lyrics from Lrclib only (first result)
     */
    async fetchFromLrclib(videoTitle: string = getVideoTitle(), info?: Partial<CurrentTrackInfo>): Promise<LyricLine[] | null> {
        console.log('[StreamLyrics] Fetching from Lrclib...');
        const lines = await lrclibService.searchByTitle(videoTitle, info);
        if (lines && lines.length > 0) {
            console.log('[StreamLyrics] Found Lrclib lyrics:', lines.length, 'lines');
            return lines;
        }
        return null;
    }

    /**
     * Fetch ALL matching lyrics from Lrclib (for alternative results)
     */
    async fetchAllFromLrclib(
        videoTitle: string = getVideoTitle(),
        info?: Partial<CurrentTrackInfo>,
        onResult?: (lines: LyricLine[]) => void
    ): Promise<LyricLine[][]> {
        console.log('[StreamLyrics] Fetching all results from Lrclib...');
        const results = await lrclibService.searchAllByTitle(videoTitle, info, onResult);
        console.log('[StreamLyrics] Found', results.length, 'Lrclib results');
        return results;
    }

    /**
     * Fetch lyrics from local storage (highest priority)
     */
    async fetchFromStorage(videoTitle: string = getVideoTitle(), info?: Partial<CurrentTrackInfo>): Promise<LyricsFetchResult | null> {
        console.log('[StreamLyrics] Checking local storage...');
        const candidates = getLyricsSearchCandidates(videoTitle, info);
        const fallback = cleanVideoTitle(videoTitle);

        for (const candidate of [...candidates, { ...fallback, query: '', reason: 'legacy' }]) {
            const savedData = await storageService.getSavedLyrics(candidate.artist, candidate.track);
            if (savedData && savedData.lines && savedData.lines.length > 0) {
                console.log('[StreamLyrics] Found saved lyrics:', savedData.lines.length, 'lines');
                return {
                    lines: savedData.lines,
                    source: (savedData.source as LyricsSource) || 'local',
                    offset: savedData.offset,
                    isPreferred: savedData.isPreferred
                };
            }
        }

        return null;
    }

    /**
     * Fetch lyrics using waterfall approach across sources
     * Priority: Local Storage -> LRCLIB
     */
    async fetchLyrics(
        videoTitle: string = getVideoTitle(),
        info?: Partial<CurrentTrackInfo>,
        onPartialResult?: (result: LyricsFetchResult) => void
    ): Promise<LyricsFetchResult | null> {
        console.log('[StreamLyrics] Starting multi-source lyrics fetch...');

        // 0. Local Storage (user saved lyrics or preferred)
        const localData = await this.fetchFromStorage(videoTitle, info);
        if (localData) {
            if (onPartialResult) onPartialResult(localData);

            // If it's a hard-saved local lyric, we return immediately.
            // If it's just 'preferred', we could return immediately too.
            return localData;
        }

        // 1. LRCLIB (global crowd-sourced)
        console.log('[StreamLyrics] Trying LRCLIB...');

        let firstResultReported = false;

        const lrclibLinesList = await this.fetchAllFromLrclib(videoTitle, info, (lines) => {
            if (!firstResultReported && onPartialResult) {
                firstResultReported = true;
                onPartialResult({ lines, source: 'lrclib' });
            }
        });

        if (lrclibLinesList.length > 0) {
            return { lines: lrclibLinesList[0], source: 'lrclib', alternatives: lrclibLinesList };
        }

        console.log('[StreamLyrics] No lyrics found from any source');
        return null;
    }
}

export const transcriptService = new TranscriptService();
