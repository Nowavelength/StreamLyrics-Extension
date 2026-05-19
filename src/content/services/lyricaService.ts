import { LyricLine } from '../types';
import { parseLrcFormat } from '../utils/transcriptParser';

/**
 * Lyrica API Service
 * Free open-source aggregator with strong Indian/Bollywood coverage
 * Pulls from YouTube Music + LRCLIB
 */
export class LyricaService {
    private readonly baseUrl = 'https://test-0k.onrender.com/lyrics/';

    /**
     * Fetch synced lyrics from Lyrica API
     */
    async fetchLyrics(artist: string, song: string): Promise<LyricLine[] | null> {
        if (!artist.trim() || !song.trim()) {
            return null;
        }

        try {
            const params = new URLSearchParams({
                artist: artist.trim(),
                song: song.trim(),
                timestamps: 'true',
            });

            const url = `${this.baseUrl}?${params.toString()}`;
            console.log('[Lyrica] Fetching:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                console.warn('[Lyrica] HTTP error:', response.status);
                return null;
            }

            const data = await response.json();

            // Check if lyrics exist
            if (!data || !data.lrc) {
                console.warn('[Lyrica] No lyrics found');
                return null;
            }

            // Parse LRC format
            const lines = parseLrcFormat(data.lrc);

            if (lines.length === 0) {
                console.warn('[Lyrica] Empty lyrics');
                return null;
            }

            console.log('[Lyrica] Success! Found', lines.length, 'lines');
            return lines;

        } catch (error) {
            console.error('[Lyrica] Error:', error);
            return null;
        }
    }
}

export const lyricaService = new LyricaService();
