import { LyricLine } from '../types';
import { parseLrcFormat, cleanVideoTitle } from '../utils/transcriptParser';

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
 * Service for fetching lyrics from Lrclib API
 * https://lrclib.net/docs
 */
export class LrclibService {
    private baseUrl = 'https://lrclib.net/api';

    /**
     * Search for lyrics by video title - returns first match
     */
    async searchByTitle(videoTitle: string): Promise<LyricLine[] | null> {
        const results = await this.searchAllByTitle(videoTitle);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Search for all matching lyrics by video title - returns array of results
     */
    async searchAllByTitle(videoTitle: string): Promise<LyricLine[][]> {
        const { artist, track } = cleanVideoTitle(videoTitle);

        console.log('[StreamLyrics] Searching Lrclib for:', { artist, track });

        try {
            const allResults: LyricLine[][] = [];

            // Search with full query
            const fullQuery = artist ? `${artist} ${track}` : track;
            const results = await this.searchQuery(fullQuery);

            if (results && results.length > 0) {
                // Get all results with synced lyrics (up to 5)
                const withSynced = results
                    .filter(r => r.syncedLyrics)
                    .slice(0, 5);

                for (const result of withSynced) {
                    if (result.syncedLyrics) {
                        const parsed = parseLrcFormat(result.syncedLyrics);
                        if (parsed.length > 0) {
                            allResults.push(parsed);
                            console.log(`[StreamLyrics] Found: ${result.artistName} - ${result.trackName}`);
                        }
                    }
                }
            }

            // If no results, try with just track name
            if (allResults.length === 0 && track) {
                const trackResults = await this.searchQuery(track);
                if (trackResults && trackResults.length > 0) {
                    const withSynced = trackResults
                        .filter(r => r.syncedLyrics)
                        .slice(0, 5);

                    for (const result of withSynced) {
                        if (result.syncedLyrics) {
                            const parsed = parseLrcFormat(result.syncedLyrics);
                            if (parsed.length > 0) {
                                allResults.push(parsed);
                                console.log(`[StreamLyrics] Found (track only): ${result.artistName} - ${result.trackName}`);
                            }
                        }
                    }
                }
            }

            console.log(`[StreamLyrics] Total Lrclib results: ${allResults.length}`);
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
