import { LyricLine } from '../types';

export interface CurrentTrackInfo {
    rawTitle: string;
    title: string;
    artist: string;
    album: string;
    videoId: string | null;
    signature: string;
}

export interface LyricsSearchCandidate {
    artist: string;
    track: string;
    query: string;
    reason: string;
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
        const parts = cleaned.split(' | ').map((p) => p.trim()).filter(Boolean);

        // If first part has quotes, it's likely: "Track" Album | Artist
        if (parts[0].includes('"')) {
            const trackMatch = parts[0].match(/"([^"]+)"/);
            if (trackMatch) {
                track = trackMatch[1].trim();
                artist = parts[parts.length - 1].trim(); // Last part is usually artist
            }
        } else if (parts[parts.length - 1].includes(',')) {
            // Multiple comma-separated artists in last part: Track | Artist1, Artist2
            track = parts[0];
            artist = parts[parts.length - 1];
        } else {
            // Default to YouTube/YT Music convention: Track | Artist (or Track | Album | Artist).
            // The previous string-length heuristic flipped these almost arbitrarily,
            // so we use the conventional ordering and let mediaSession (handled by
            // getCurrentTrackInfo) override when available.
            track = parts[0];
            artist = parts[parts.length - 1];
        }
    }
    // Check for dash separator (common format)
    else if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        artist = parts[0].trim();
        track = parts.slice(1).join(' - ').trim();
    }
    // Check for other separators
    else if (/\s+[–—]\s+/.test(cleaned)) {
        const parts = cleaned.split(/\s+[–—]\s+/);
        artist = parts[0].trim();
        track = parts.slice(1).join(' - ').trim();
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
            return el.textContent.trim();
        }
    }

    // Fallback to document title
    const docTitle = document.title
        .replace(' - YouTube Music', '')
        .replace(' - YouTube', '')
        .trim();

    return docTitle;
}

function uniqueNonEmpty(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = value.replace(/\s+/g, ' ').trim();
        const key = normalized.toLowerCase();
        if (!normalized || seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(normalized);
    }

    return result;
}

function stripDecorators(value: string): string {
    return value
        .replace(/\(\s*from\s+["'][^"']+["']\s*\)/gi, '')
        .replace(/\[\s*from\s+["'][^"']+["']\s*\]/gi, '')
        .replace(/\([^)]*(official|music\s*video|lyric|lyrics|lyrical|full\s*video|full\s*song|audio|visualizer|4k|hd|hq|1080p|720p)[^)]*\)/gi, '')
        .replace(/\[[^\]]*(official|music\s*video|lyric|lyrics|lyrical|full\s*video|full\s*song|audio|visualizer|4k|hd|hq|1080p|720p)[^\]]*\]/gi, '')
        .replace(/\b(official|music\s*video|lyric\s*video|lyrics\s*video|lyrical\s*video|full\s*video|full\s*song|audio|visualizer|4k|hd|hq|1080p|720p)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitPeople(value: string): string[] {
    return value
        .split(/\s*(?:,|&|\band\b|\/|\+)\s*/i)
        .map((part) => cleanArtistText(part.replace(/\b(feat|ft|with|singer|singers|music|lyrics?|composer|starring)\b\.?/gi, '')))
        .filter(Boolean);
}

function cleanArtistText(value: string): string {
    return value
        .replace(/\s+-\s+Topic$/i, '')
        .replace(/\b\d+(\.\d+)?[KMB]?\s+(views?|subscribers?)\b/gi, '')
        .replace(/\b(song|video|official|album|single)\b/gi, '')
        .split(/\s+[•·]\s+/)[0]
        .split(/\s+-\s+/)[0]
        .replace(/\s+/g, ' ')
        .trim();
}

function artistVariants(value: string): string[] {
    const variants = [value];

    if (/^a\.?\s*r\.?\s+rahman$/i.test(value)) {
        variants.push('A.R. Rahman', 'AR Rahman', 'A R Rahman');
    }

    return variants;
}

function makeQuery(artist: string, track: string): string {
    return artist ? `${artist} ${track}` : track;
}

function addCandidate(
    candidates: LyricsSearchCandidate[],
    seen: Set<string>,
    artist: string,
    track: string,
    reason: string
) {
    const cleanArtist = stripDecorators(artist);
    const cleanTrack = stripDecorators(track);

    if (!cleanTrack || cleanTrack.length < 2) {
        return;
    }

    const key = `${cleanArtist.toLowerCase()}|${cleanTrack.toLowerCase()}`;
    if (seen.has(key)) {
        return;
    }

    seen.add(key);
    candidates.push({
        artist: cleanArtist,
        track: cleanTrack,
        query: makeQuery(cleanArtist, cleanTrack),
        reason,
    });
}

export function getLyricsSearchCandidates(rawTitle: string, info?: Partial<CurrentTrackInfo>): LyricsSearchCandidate[] {
    const title = rawTitle.replace(/\s+/g, ' ').trim();
    const parsed = cleanVideoTitle(title);
    const pipeParts = uniqueNonEmpty(title.split('|').map(stripDecorators));
    const mainPart = pipeParts[0] || stripDecorators(title);
    const contributorParts = pipeParts.slice(1);
    const colonParts = mainPart.split(/\s*:\s*/).map(stripDecorators).filter(Boolean);

    const titleWithoutChannel = stripDecorators(mainPart.replace(/\s+-\s+Topic$/i, ''));
    const trackSeeds = uniqueNonEmpty([
        colonParts.length > 1 ? colonParts[colonParts.length - 1] : '',
        parsed.track,
        titleWithoutChannel,
        colonParts.length > 1 ? colonParts.join(' ') : '',
        colonParts[0] || '',
    ]);

    const artistSeeds = uniqueNonEmpty([
        ...(info?.artist ? splitPeople(info.artist) : []),
        ...(parsed.artist ? splitPeople(parsed.artist) : []),
        ...contributorParts.flatMap(splitPeople),
    ].flatMap(artistVariants)).slice(0, 10);
    const mediaOnlyTrack = info?.title && !titleWithoutChannel ? info.title : '';
    const finalTrackSeeds = uniqueNonEmpty([...trackSeeds, mediaOnlyTrack]);

    const candidates: LyricsSearchCandidate[] = [];
    const seen = new Set<string>();

    for (const track of finalTrackSeeds) {
        for (const artist of artistSeeds) {
            addCandidate(candidates, seen, artist, track, 'artist-track');
        }
    }

    for (const track of finalTrackSeeds) {
        addCandidate(candidates, seen, '', track, 'track-only');
    }

    if (parsed.artist && parsed.track) {
        addCandidate(candidates, seen, parsed.track, parsed.artist, 'swapped artist-track');
    }

    return candidates.slice(0, 24);
}

function getFirstText(selectors: string[]): string {
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) {
            return text.replace(/\s+/g, ' ');
        }
    }

    return '';
}

function getMediaSessionInfo(): { title: string; artist: string; album: string } {
    const metadata = (navigator as any).mediaSession?.metadata;

    return {
        title: metadata?.title?.trim?.() || '',
        artist: metadata?.artist?.trim?.() || '',
        album: metadata?.album?.trim?.() || '',
    };
}

export function getVideoArtist(): string {
    const isYouTubeMusic = window.location.hostname === 'music.youtube.com';
    const ytMusicSelectors = [
        'ytmusic-player-bar .byline',
        'ytmusic-player-bar .subtitle',
        'ytmusic-player-bar .secondary-flex-columns yt-formatted-string',
        'ytmusic-player-bar .subtitle.ytmusic-player-bar',
        'ytmusic-player-bar .content-info-wrapper .subtitle',
        'ytmusic-player-bar yt-formatted-string.subtitle',
        '.content-info-wrapper yt-formatted-string.subtitle',
        'ytmusic-player-page .byline',
        'ytmusic-player-page .subtitle',
        'ytmusic-player-page yt-formatted-string.byline',
        'ytmusic-player-page yt-formatted-string.subtitle',
        'ytmusic-responsive-list-item-renderer a[href*="/channel/"]',
        'ytmusic-responsive-list-item-renderer a[href*="/browse/"]',
    ];
    const ytSelectors = [
        'ytd-watch-metadata ytd-video-owner-renderer #channel-name a',
        '#owner #channel-name a',
        '#upload-info #channel-name a',
    ];
    const text = getFirstText(isYouTubeMusic ? ytMusicSelectors : ytSelectors);

    return cleanArtistText(text);
}

function normalizeTrackPart(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Build a stable identity for the currently playing track.
 * Media Session metadata keeps updating even when the YouTube tab is hidden,
 * so it is a useful companion to DOM title polling for the popout window.
 */
export function getCurrentTrackInfo(): CurrentTrackInfo {
    const media = getMediaSessionInfo();
    const pageTitle = getVideoTitle();
    const parsed = cleanVideoTitle(pageTitle);
    const isYouTubeMusic = window.location.hostname === 'music.youtube.com';
    const title = isYouTubeMusic
        ? (media.title || parsed.track || pageTitle)
        : (parsed.track || pageTitle || media.title);
    const artist = media.artist || getVideoArtist() || parsed.artist;
    const album = media.album || '';
    const videoId = getVideoId();
    const signatureParts = [videoId || '', title, artist, album].map(normalizeTrackPart);
    const signature = signatureParts.filter(Boolean).join('|');

    return {
        rawTitle: pageTitle,
        title,
        artist,
        album,
        videoId,
        signature,
    };
}

export function getLyricsSearchTitle(info: CurrentTrackInfo = getCurrentTrackInfo()): string {
    if (info.artist && info.title.toLowerCase().startsWith(`${info.artist.toLowerCase()} - `)) {
        return info.title;
    }

    if (info.artist) {
        return `${info.artist} - ${info.title}`;
    }

    return info.title;
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
