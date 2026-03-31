import { LyricLine } from '../types';

/**
 * Custom error classes for YouTube transcript operations
 */
export class TranscriptsDisabledError extends Error {
    constructor(videoId: string) {
        super(`Transcripts are disabled for video: ${videoId}`);
        this.name = 'TranscriptsDisabledError';
    }
}

export class NoTranscriptFoundError extends Error {
    constructor(videoId: string, languages?: string[]) {
        const langMsg = languages ? ` (languages: ${languages.join(', ')})` : '';
        super(`No transcript found for video: ${videoId}${langMsg}`);
        this.name = 'NoTranscriptFoundError';
    }
}

export class VideoUnavailableError extends Error {
    constructor(videoId: string) {
        super(`Video unavailable: ${videoId}`);
        this.name = 'VideoUnavailableError';
    }
}

/**
 * Parse YouTube's timedtext XML format into LyricLine array
 */
export function parseYouTubeTranscript(xmlText: string): LyricLine[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const textElements = doc.querySelectorAll('text');

    const lines: LyricLine[] = [];

    textElements.forEach((el) => {
        const start = parseFloat(el.getAttribute('start') || '0');
        const duration = parseFloat(el.getAttribute('dur') || '2');
        const text = decodeHTMLEntities(el.textContent || '');

        if (text.trim()) {
            lines.push({ start, duration, text: text.trim() });
        }
    });

    return lines;
}

/**
 * Parse LRC format from Lrclib into LyricLine array
 * LRC format: [mm:ss.xx] text
 */
export function parseLrcFormat(lrcText: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.+)/g;

    let match;
    while ((match = regex.exec(lrcText)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
        const text = match[4].trim();

        const start = minutes * 60 + seconds + milliseconds / 1000;

        if (text) {
            lines.push({ start, duration: 0, text });
        }
    }

    // Calculate durations based on next line's start time
    for (let i = 0; i < lines.length - 1; i++) {
        lines[i].duration = lines[i + 1].start - lines[i].start;
    }

    // Last line gets a default duration
    if (lines.length > 0) {
        lines[lines.length - 1].duration = 5;
    }

    return lines;
}

/**
 * Decode HTML entities in text
 */
function decodeHTMLEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n/g, ' ');
}

/**
 * Clean video title for lyrics search
 * Removes common patterns like "Official Video", "4K", etc.
 */
export function cleanVideoTitle(title: string): { artist: string; track: string } {
    let cleaned = title
        // Remove common video descriptors
        .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
        .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
        .replace(/Official\s*(Music\s*)?Video/gi, '')
        .replace(/\(Official\s*Audio\)/gi, '')
        .replace(/\[Official\s*Audio\]/gi, '')
        .replace(/\(Lyrics?\s*(Video)?\)/gi, '')
        .replace(/\[Lyrics?\s*(Video)?\]/gi, '')
        .replace(/Lyrics?\s*Video/gi, '')
        .replace(/\(Audio\)/gi, '')
        .replace(/\[Audio\]/gi, '')
        .replace(/\(Visualizer\)/gi, '')
        .replace(/\[Visualizer\]/gi, '')
        // Remove quality indicators
        .replace(/\(?4K\)?/gi, '')
        .replace(/\(?HD\)?/gi, '')
        .replace(/\(?HQ\)?/gi, '')
        .replace(/\(?1080p\)?/gi, '')
        .replace(/\(?720p\)?/gi, '')
        // Remove featuring patterns for cleaner search
        .replace(/ft\.\s*/gi, 'feat. ')
        .replace(/feat\s+/gi, 'feat. ')
        // Clean up extra whitespace
        .replace(/\s+/g, ' ')
        .trim();

    // Try to split artist - track
    let artist = '';
    let track = cleaned;

    // YouTube formats:
    // 1. "Track Name" Movie/Album | Artist(s)
    // 2. Artist - Track
    // 3. Track | Artist

    // Check for pipe separator (most common on YT Music)
    if (cleaned.includes(' | ')) {
        const parts = cleaned.split(' | ');

        // If first part has quotes, it's likely: "Track" Album | Artist
        if (parts[0].includes('"')) {
            const trackMatch = parts[0].match(/"([^"]+)"/);
            if (trackMatch) {
                track = trackMatch[1].trim();
                artist = parts[parts.length - 1].trim(); // Last part is usually artist
            }
        } else {
            // Standard: Track | Artist or Artist | Track
            // If last part has commas (multiple artists), it's likely: Track | Artist1, Artist2
            if (parts[parts.length - 1].includes(',')) {
                track = parts[0].trim();
                artist = parts[parts.length - 1].trim();
            } else {
                // Guess: shorter part is likely the artist
                if (parts[0].length < parts[1].length) {
                    artist = parts[0].trim();
                    track = parts[1].trim();
                } else {
                    track = parts[0].trim();
                    artist = parts[1].trim();
                }
            }
        }
    }
    // Check for dash separator (common format)
    else if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        artist = parts[0].trim();
        track = parts.slice(1).join(' - ').trim();
    }
    // Check for other separators
    else if (cleaned.includes(' – ')) {
        const parts = cleaned.split(' – ');
        artist = parts[0].trim();
        track = parts.slice(1).join(' – ').trim();
    }
    else if (cleaned.includes(' — ')) {
        const parts = cleaned.split(' — ');
        artist = parts[0].trim();
        track = parts.slice(1).join(' — ').trim();
    }

    // Fallback: if we still don't have an artist, use the whole title as track
    if (!artist && !track) {
        track = cleaned;
    }

    return { artist, track };
}

/**
 * Extract video ID from any valid YouTube URL format
 * Supports:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/v/VIDEO_ID
 * - music.youtube.com/watch?v=VIDEO_ID
 * 
 * @param url - Optional URL to parse (defaults to current window.location)
 * @returns Video ID or null if not found
 */
export function getVideoId(url?: string): string | null {
    const targetUrl = url || window.location.href;

    // Method 1: Query parameter (most common)
    try {
        const urlObj = new URL(targetUrl);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
            return videoId;
        }
    } catch (e) {
        // Invalid URL, try other methods
    }

    // Method 2: youtu.be short links
    const youtuBeMatch = targetUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (youtuBeMatch) {
        return youtuBeMatch[1];
    }

    // Method 3: Embed URLs
    const embedMatch = targetUrl.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
        return embedMatch[1];
    }

    // Method 4: /v/ format
    const vMatch = targetUrl.match(/youtube\.com\/v\/([a-zA-Z0-9_-]{11})/);
    if (vMatch) {
        return vMatch[1];
    }

    // Method 5: Extract from any URL containing 11-character video ID pattern
    const genericMatch = targetUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (genericMatch) {
        return genericMatch[1];
    }

    return null;
}

/**
 * Get video title from page (works for YouTube and YouTube Music)
 */
export function getVideoTitle(): string {
    // YouTube Music selectors - check multiple locations
    const ytMusicSelectors = [
        'ytmusic-player-bar .title.ytmusic-player-bar',
        'ytmusic-player-bar .content-info-wrapper .title',
        '.ytmusic-player-bar .title',
        'ytmusic-player-bar yt-formatted-string.title',
        '.content-info-wrapper yt-formatted-string.title',
    ];

    for (const selector of ytMusicSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            console.log('[StreamLyrics] Found title via:', selector, '->', el.textContent.trim());
            return el.textContent.trim();
        }
    }

    // YouTube selectors - check multiple locations
    const ytSelectors = [
        '#title h1 yt-formatted-string',
        'h1.ytd-video-primary-info-renderer yt-formatted-string',
        '#above-the-fold #title yt-formatted-string',
        'ytd-watch-metadata #title yt-formatted-string',
        '#info-contents h1',
        'h1.title',
    ];

    for (const selector of ytSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            console.log('[StreamLyrics] Found title via:', selector, '->', el.textContent.trim());
            return el.textContent.trim();
        }
    }

    // Fallback to document title
    const docTitle = document.title
        .replace(' - YouTube Music', '')
        .replace(' - YouTube', '')
        .trim();

    console.log('[StreamLyrics] Using document title fallback:', docTitle);
    return docTitle;
}

/**
 * Convert transcript array to full plain text
 * Concatenates all text segments with proper spacing
 * 
 * @param transcript - Array of LyricLine objects
 * @returns Full text content as a single string
 */
export function getFullText(transcript: LyricLine[]): string {
    if (!transcript || transcript.length === 0) {
        return '';
    }

    return transcript
        .map(line => line.text.trim())
        .filter(text => text.length > 0)
        .join(' ');
}

/**
 * Get transcript in structured format
 * Simplified interface matching Python youtube-transcript-api
 * 
 * @param transcript - Array of LyricLine objects
 * @returns Array of simplified transcript segments
 */
export function getTranscript(transcript: LyricLine[]): Array<{ start: number; text: string }> {
    return transcript.map(line => ({
        start: line.start,
        text: line.text
    }));
}
