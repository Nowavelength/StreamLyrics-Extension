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
    const rawArtist = artist.trim().toLowerCase();
    const rawTitle = title.trim().toLowerCase();

    // 1. Generate old-style key for backwards compatibility
    const oldArtist = rawArtist.replace(/[^a-z0-9]/g, '');
    const oldTitle = rawTitle.replace(/[^a-z0-9]/g, '');
    
    // If it's a standard Latin-only track, use the old key format so 
    // existing user cache is fully preserved.
    if (oldArtist.length > 0 && oldTitle.length > 0) {
        return `${STORAGE_PREFIX}${oldArtist}_${oldTitle}`;
    }

    // 2. For international scripts, generate a unique, safe key using URL encoding
    // combined with a stable FNV-1a hash for absolute collision resistance.
    const safeArtist = encodeURIComponent(rawArtist).replace(/%/g, '_').substring(0, 20);
    const safeTitle = encodeURIComponent(rawTitle).replace(/%/g, '_').substring(0, 20);
    
    const hashInput = `${rawArtist}|${rawTitle}`;
    let hash = 2166136261;
    for (let i = 0; i < hashInput.length; i++) {
        hash ^= hashInput.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    const suffix = (hash >>> 0).toString(16).padStart(8, '0');

    return `${STORAGE_PREFIX}i18n_${safeArtist}_${safeTitle}_${suffix}`;
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
