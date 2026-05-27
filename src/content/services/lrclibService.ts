import { LyricLine } from '../types';
import {
    CurrentTrackInfo,
    parseLrcFormat,
    cleanVideoTitle,
    getLyricsSearchCandidates,
    getVideoArtist,
} from '../utils/transcriptParser';

interface LrclibSearchResult {
    id: number;
    name: string;
    trackName: string;
    artistName: string;
    albumName: string;
    duration: number;
    instrumental: boolean;
    plainLyrics: string | null;
    syncedLyrics: string | null;
}

const BASE_URL = 'https://lrclib.net/api';
const MAX_RESULTS = 10;
const CONCURRENCY = 4;

/**
 * Content-based signature for deduplication. Two LRC results are "the same"
 * iff their text lines (lowercased) match exactly.
 */
function lyricsSignature(lines: LyricLine[]): string {
    return lines.map((l) => l.text.trim().toLowerCase()).join('\n');
}

/**
 * LRCLIB lyrics search. Issues several diverse queries in parallel (with a
 * concurrency cap) and accumulates unique results.
 */
export class LrclibService {
    async searchByTitle(
        videoTitle: string,
        info?: Partial<CurrentTrackInfo>,
    ): Promise<LyricLine[] | null> {
        const results = await this.searchAllByTitle(videoTitle, info);
        return results.length > 0 ? results[0] : null;
    }

    async searchAllByTitle(
        videoTitle: string,
        info?: Partial<CurrentTrackInfo>,
        onResult?: (lines: LyricLine[]) => void,
    ): Promise<LyricLine[][]> {
        const { artist, track } = cleanVideoTitle(videoTitle);
        const candidates = getLyricsSearchCandidates(videoTitle, info);

        const queryPlan: { query: string; reason: string }[] = [];

        if (artist && track) {
            queryPlan.push({ query: `${artist} ${track}`, reason: 'detected-full' });
        }
        if (track && track !== artist) {
            queryPlan.push({ query: track, reason: 'track-only' });
        }

        const channelArtist = getVideoArtist();
        if (channelArtist && channelArtist !== artist && track) {
            queryPlan.push({
                query: `${channelArtist} ${track}`,
                reason: 'channel-artist',
            });
        }

        if (
            info?.artist &&
            info.artist !== artist &&
            info.artist !== channelArtist &&
            track
        ) {
            queryPlan.push({
                query: `${info.artist} ${track}`,
                reason: 'media-session-artist',
            });
        }

        const rawCleaned = videoTitle
            .replace(/\(.*?\)/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (rawCleaned && rawCleaned !== track) {
            queryPlan.push({ query: rawCleaned, reason: 'raw-cleaned' });
        }

        for (const c of candidates.slice(0, 12)) {
            const q = c.artist ? `${c.artist} ${c.track}` : c.track;
            queryPlan.push({ query: q, reason: `candidate:${c.reason}` });
        }

        // De-dupe queries.
        const seenQueries = new Set<string>();
        const uniquePlan = queryPlan.filter(({ query }) => {
            const clean = query.replace(/\s+/g, ' ').trim().toLowerCase();
            if (!clean || seenQueries.has(clean)) return false;
            seenQueries.add(clean);
            return true;
        });

        const allResults: LyricLine[][] = [];
        const seenSignatures = new Set<string>();

        // Run queries with bounded concurrency.
        let cursor = 0;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
            while (cursor < uniquePlan.length && allResults.length < MAX_RESULTS) {
                const idx = cursor++;
                const { query } = uniquePlan[idx];
                const apiResults = await this.searchQuery(query);
                if (!apiResults || apiResults.length === 0) continue;

                const synced = apiResults
                    .filter((r) => r.syncedLyrics)
                    .slice(0, 3);

                for (const r of synced) {
                    if (allResults.length >= MAX_RESULTS) break;
                    if (!r.syncedLyrics) continue;
                    const parsed = parseLrcFormat(r.syncedLyrics);
                    if (parsed.length === 0) continue;
                    const sig = lyricsSignature(parsed);
                    if (seenSignatures.has(sig)) continue;
                    seenSignatures.add(sig);
                    allResults.push(parsed);
                    onResult?.(parsed);
                }
            }
        });

        await Promise.all(workers);
        return allResults;
    }

    private async searchQuery(
        query: string,
    ): Promise<LrclibSearchResult[] | null> {
        const params = new URLSearchParams({ q: query });
        try {
            const response = await fetch(`${BASE_URL}/search?${params}`);
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        }
    }
}

export const lrclibService = new LrclibService();
