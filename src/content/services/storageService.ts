import { LyricLine } from '../types';

/**
 * Storage key prefix for lyrics
 */
const STORAGE_PREFIX = 'lyrics_';

/**
 * Interface for saved lyrics data
 */
export interface SavedLyrics {
    lines: LyricLine[];
    savedAt: number;
    source: 'local' | 'lrclib' | 'youtube';
    originalSource?: string;
    query?: string;
    offset?: number;
    isPreferred?: boolean;
}

/**
 * Sanitize artist and title for storage key
 */
function getStorageKey(artist: string, title: string): string {
    const safeArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${STORAGE_PREFIX}${safeArtist}_${safeTitle}`;
}

export const storageService = {
    /**
     * Save lyrics to local storage (explicit save by user)
     */
    async saveLyrics(artist: string, title: string, lines: LyricLine[], offset?: number, query?: string): Promise<void> {
        const key = getStorageKey(artist, title);
        const data: SavedLyrics = {
            lines,
            savedAt: Date.now(),
            source: 'local',
            offset,
            query
        };

        await chrome.storage.local.set({ [key]: data });
        console.log(`[Storage] Saved lyrics for ${artist} - ${title}`);
    },

    /**
     * Save a preferred choice (lightweight save, reused on next visit)
     */
    async savePreferredLyrics(artist: string, title: string, lines: LyricLine[], source: 'local' | 'lrclib' | 'youtube', offset?: number, query?: string): Promise<void> {
        const key = getStorageKey(artist, title);
        const data: SavedLyrics = {
            lines,
            savedAt: Date.now(),
            source,
            isPreferred: true,
            offset,
            query
        };

        await chrome.storage.local.set({ [key]: data });
        console.log(`[Storage] Saved preferred lyrics for ${artist} - ${title}`);
    },

    /**
     * Get lyrics from local storage (either manually saved or preferred)
     */
    async getSavedLyrics(artist: string, title: string): Promise<SavedLyrics | null> {
        const key = getStorageKey(artist, title);
        const result = await chrome.storage.local.get(key);
        const data = result[key] as SavedLyrics | undefined;

        if (data && data.lines) {
            console.log(`[Storage] Found saved/preferred lyrics for ${artist} - ${title}`);
            return data;
        }

        return null;
    },

    /**
     * Check if lyrics exist in storage
     */
    async hasLyrics(artist: string, title: string): Promise<boolean> {
        const key = getStorageKey(artist, title);
        const result = await chrome.storage.local.get(key);
        return !!result[key];
    },

    /**
     * Delete lyrics from local storage
     */
    async deleteLyrics(artist: string, title: string): Promise<void> {
        const key = getStorageKey(artist, title);
        await chrome.storage.local.remove(key);
        console.log(`[Storage] Deleted lyrics for ${artist} - ${title}`);
    }
};
