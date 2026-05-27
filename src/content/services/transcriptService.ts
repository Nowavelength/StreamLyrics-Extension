import { LyricLine } from '../types';
import {
    CurrentTrackInfo,
    cleanVideoTitle,
    getLyricsSearchCandidates,
    getVideoTitle,
} from '../utils/transcriptParser';
import { lrclibService } from './lrclibService';
import { storageService } from './storageService';

export type LyricsSource = 'local' | 'youtube' | 'lrclib';

export interface LyricsFetchResult {
    lines: LyricLine[];
    source: LyricsSource;
    alternatives?: LyricLine[][];
    offset?: number;
    isPreferred?: boolean;
}

/**
 * Multi-source lyrics service.
 * Lookup order: local saved/preferred → LRCLIB.
 */
export class TranscriptService {
    /**
     * Get the best LRCLIB result (first match).
     */
    async fetchFromLrclib(
        videoTitle: string = getVideoTitle(),
        info?: Partial<CurrentTrackInfo>,
    ): Promise<LyricLine[] | null> {
        const lines = await lrclibService.searchByTitle(videoTitle, info);
        return lines && lines.length > 0 ? lines : null;
    }

    /**
     * All LRCLIB matches (used to populate the "next result" cycler).
     */
    async fetchAllFromLrclib(
        videoTitle: string = getVideoTitle(),
        info?: Partial<CurrentTrackInfo>,
        onResult?: (lines: LyricLine[]) => void,
    ): Promise<LyricLine[][]> {
        return lrclibService.searchAllByTitle(videoTitle, info, onResult);
    }

    /**
     * Search local storage. Tries every artist/track candidate in parallel and
     * picks the first hit (in candidate order, not response order).
     */
    async fetchFromStorage(
        videoTitle: string = getVideoTitle(),
        info?: Partial<CurrentTrackInfo>,
    ): Promise<LyricsFetchResult | null> {
        const candidates = getLyricsSearchCandidates(videoTitle, info);
        const fallback = cleanVideoTitle(videoTitle);
        const allCandidates = [
            ...candidates,
            { ...fallback, query: '', reason: 'legacy' },
        ];

        const results = await Promise.all(
            allCandidates.map((c) =>
                storageService.getSavedLyrics(c.artist, c.track),
            ),
        );

        for (const saved of results) {
            if (saved && saved.lines && saved.lines.length > 0) {
                return {
                    lines: saved.lines,
                    source: (saved.source as LyricsSource) || 'local',
                    offset: saved.offset,
                    isPreferred: saved.isPreferred,
                };
            }
        }

        return null;
    }

    /**
     * Waterfall fetch: local first (instant) → LRCLIB.
     */
    async fetchLyrics(
        videoTitle: string = getVideoTitle(),
        info?: Partial<CurrentTrackInfo>,
        onPartialResult?: (result: LyricsFetchResult) => void,
    ): Promise<LyricsFetchResult | null> {
        const localData = await this.fetchFromStorage(videoTitle, info);
        if (localData) {
            onPartialResult?.(localData);
            return localData;
        }

        let firstResultReported = false;
        const lrclibResults = await this.fetchAllFromLrclib(
            videoTitle,
            info,
            (lines) => {
                if (!firstResultReported && onPartialResult) {
                    firstResultReported = true;
                    onPartialResult({ lines, source: 'lrclib' });
                }
            },
        );

        if (lrclibResults.length > 0) {
            return {
                lines: lrclibResults[0],
                source: 'lrclib',
                alternatives: lrclibResults,
            };
        }

        return null;
    }
}

export const transcriptService = new TranscriptService();
