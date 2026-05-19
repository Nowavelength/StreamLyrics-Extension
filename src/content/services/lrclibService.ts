import { LyricLine } from '../types';
import {
    CurrentTrackInfo,
    parseLrcFormat,
    cleanVideoTitle,
    getLyricsSearchCandidates,
    LyricsSearchCandidate,
    getVideoTitle,
    getVideoArtist
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

/**
 * Compute a content-based signature for deduplication.
 * Two lyrics are "the same" only if their text lines match exactly.
 */
function lyricsSignature(lines: LyricLine[]): string {
    return lines.map(l => l.text.trim().toLowerCase()).join('\n');
}

/**
 * Service for fetching lyrics from Lrclib API
 * https://lrclib.net/docs
 *
 * Multi-strategy fetcher: runs 2-3 independent fetch passes using different
 * query combinations (detected title, cleaned title, channel-as-artist,
 * YouTube Music metadata, title-only fallback, etc.) and collects ALL unique
 * lyrics across every pass into one list.
 */
export class LrclibService {
    private baseUrl = 'https://lrclib.net/api';

    /**
     * Search for lyrics by video title - returns first match
     */
    async searchByTitle(videoTitle: string, info?: Partial<CurrentTrackInfo>): Promise<LyricLine[] | null> {
        const results = await this.searchAllByTitle(videoTitle, info);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Multi-strategy search.  Runs EVERY candidate query independently,
     * collects unique lyrics across all of them, and streams results back
     * via the optional onResult callback.
     */
    async searchAllByTitle(
        videoTitle: string,
        info?: Partial<CurrentTrackInfo>,
        onResult?: (lines: LyricLine[]) => void
    ): Promise<LyricLine[][]> {
        const { artist, track } = cleanVideoTitle(videoTitle);
        const candidates = getLyricsSearchCandidates(videoTitle, info);

        console.log('[StreamLyrics] Multi-strategy search starting:', { artist, track, candidateCount: candidates.length });

        try {
            const allResults: LyricLine[][] = [];
            const seenSignatures = new Set<string>();
            const seenQueries = new Set<string>();

            // --- Build a list of diverse query strings to try ---
            const queryPlan: { query: string; reason: string }[] = [];

            // Pass 1: Original detected artist + track
            if (artist && track) {
                queryPlan.push({ query: `${artist} ${track}`, reason: 'detected-full' });
            }

            // Pass 2: Track-only (catches cases where artist parsing is wrong)
            if (track && track !== artist) {
                queryPlan.push({ query: track, reason: 'track-only' });
            }

            // Pass 3: Channel name as artist (YouTube channel often IS the artist)
            const channelArtist = getVideoArtist();
            if (channelArtist && channelArtist !== artist && track) {
                queryPlan.push({ query: `${channelArtist} ${track}`, reason: 'channel-artist' });
            }

            // Pass 4: YouTube Music / MediaSession metadata artist
            if (info?.artist && info.artist !== artist && info.artist !== channelArtist && track) {
                queryPlan.push({ query: `${info.artist} ${track}`, reason: 'media-session-artist' });
            }

            // Pass 5: Raw title stripped of decorators (catches messy titles)
            const rawCleaned = videoTitle
                .replace(/\(.*?\)/g, '')
                .replace(/\[.*?\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (rawCleaned && rawCleaned !== track) {
                queryPlan.push({ query: rawCleaned, reason: 'raw-cleaned' });
            }

            // Pass 6+: All candidates from getLyricsSearchCandidates (already diverse)
            for (const c of candidates.slice(0, 12)) {
                const q = c.artist ? `${c.artist} ${c.track}` : c.track;
                queryPlan.push({ query: q, reason: `candidate:${c.reason}` });
            }

            console.log(`[StreamLyrics] Query plan: ${queryPlan.length} queries`);

            // --- Execute each query, accumulate unique lyrics ---
            const MAX_RESULTS = 10;

            for (const { query, reason } of queryPlan) {
                if (allResults.length >= MAX_RESULTS) break;

                const cleanQuery = query.replace(/\s+/g, ' ').trim();
                const key = cleanQuery.toLowerCase();
                if (!cleanQuery || seenQueries.has(key)) continue;
                seenQueries.add(key);

                console.log(`[StreamLyrics] Query [${reason}]: "${cleanQuery}"`);

                const apiResults = await this.searchQuery(cleanQuery);
                if (!apiResults || apiResults.length === 0) continue;

                const withSynced = apiResults.filter(r => r.syncedLyrics).slice(0, 3);

                for (const result of withSynced) {
                    if (allResults.length >= MAX_RESULTS) break;
                    if (!result.syncedLyrics) continue;

                    const parsed = parseLrcFormat(result.syncedLyrics);
                    if (parsed.length === 0) continue;

                    const sig = lyricsSignature(parsed);
                    if (seenSignatures.has(sig)) continue;

                    seenSignatures.add(sig);
                    allResults.push(parsed);
                    console.log(`[StreamLyrics] ✓ Found [${reason}]: ${result.artistName} - ${result.trackName} (${parsed.length} lines)`);

                    if (onResult) {
                        onResult(parsed);
                    }
                }
            }

            console.log(`[StreamLyrics] Total unique results: ${allResults.length} from ${seenQueries.size} queries`);
            return allResults;
        } catch (error) {
            console.error('[StreamLyrics] Lrclib search error:', error);
            return [];
        }
    }

    /**
     * General search query
     */
    private async searchQuery(query: string): Promise<LrclibSearchResult[] | null> {
        const params = new URLSearchParams({ q: query });

        try {
            const response = await fetch(`${this.baseUrl}/search?${params}`);

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch {
            return null;
        }
    }
}

export const lrclibService = new LrclibService();
