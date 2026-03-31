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
    source: 'local';
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
     * Save lyrics to local storage
     */
    async saveLyrics(artist: string, title: string, lines: LyricLine[]): Promise<void> {
        const key = getStorageKey(artist, title);
        const data: SavedLyrics = {
            lines,
            savedAt: Date.now(),
            source: 'local'
        };

        await chrome.storage.local.set({ [key]: data });
        console.log(`[Storage] Saved lyrics for ${artist} - ${title}`);
    },

    /**
     * Get lyrics from local storage
     */
    async getSavedLyrics(artist: string, title: string): Promise<LyricLine[] | null> {
        const key = getStorageKey(artist, title);
        const result = await chrome.storage.local.get(key);
        const data = result[key] as SavedLyrics | undefined;

        if (data && data.lines) {
            console.log(`[Storage] Found saved lyrics for ${artist} - ${title}`);
            return data.lines;
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
