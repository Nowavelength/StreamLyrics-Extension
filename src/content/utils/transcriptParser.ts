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
 * Parse YouTube's timedtext XML into a LyricLine[].
 */
export function parseYouTubeTranscript(xmlText: string): LyricLine[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const elements = doc.querySelectorAll('text');
    const lines: LyricLine[] = [];

    elements.forEach((el) => {
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
 * Parse LRC text. Handles single AND multi-timestamp lines:
 *   [00:01.00]Hello
 *   [00:05.00][00:30.00]Same lyric repeated
 */
export function parseLrcFormat(lrcText: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const tsPattern = /\[(\d{1,2}):(\d{2})\.(\d{2,3})\]/g;

    for (const rawLine of lrcText.split(/\r?\n/)) {
        // Collect every timestamp prefix on the line.
        const stamps: number[] = [];
        let match: RegExpExecArray | null;
        let lastEnd = 0;
        tsPattern.lastIndex = 0;
        while ((match = tsPattern.exec(rawLine)) !== null) {
            // Only accept timestamps that are contiguous from the start (no
            // text between them).
            if (match.index !== lastEnd) break;
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const fractional = parseInt(match[3].padEnd(3, '0'), 10);
            stamps.push(minutes * 60 + seconds + fractional / 1000);
            lastEnd = match.index + match[0].length;
        }
        if (stamps.length === 0) continue;

        const text = rawLine.slice(lastEnd).trim();
        // Skip metadata-only lines like [ar:Artist], [length:03:14] etc.
        if (!text) continue;

        for (const start of stamps) {
            lines.push({ start, duration: 0, text });
        }
    }

    // Sort by start time (multi-timestamp lines may be out of order).
    lines.sort((a, b) => a.start - b.start);

    // Compute durations from neighbours.
    for (let i = 0; i < lines.length - 1; i++) {
        lines[i].duration = lines[i + 1].start - lines[i].start;
    }
    if (lines.length > 0) {
        lines[lines.length - 1].duration = Math.max(
            5,
            lines[lines.length - 1].duration,
        );
    }

    return lines;
}

/**
 * Decode HTML entities. The textarea trick handles all named & numeric
 * entities natively.
 */
function decodeHTMLEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value.replace(/\n/g, ' ');
}

const NOISE_PATTERNS: RegExp[] = [
    /\(\s*official\s*(music\s*)?video\s*\)/gi,
    /\[\s*official\s*(music\s*)?video\s*\]/gi,
    /\b official\s*(music\s*)?video \b/gi,
    /\(\s*official\s*audio\s*\)/gi,
    /\[\s*official\s*audio\s*\]/gi,
    /\(\s*lyrics?\s*(video)?\s*\)/gi,
    /\[\s*lyrics?\s*(video)?\s*\]/gi,
    /\b lyrics?\s*video \b/gi,
    /\(\s*audio\s*\)/gi,
    /\[\s*audio\s*\]/gi,
    /\(\s*visualizer\s*\)/gi,
    /\[\s*visualizer\s*\]/gi,
    // Quality tags — only inside parens/brackets OR as standalone words.
    /[\(\[]\s*(4K|HD|HQ|1080p|720p)\s*[\)\]]/gi,
    /(?:^|\s)(4K|HD|HQ|1080p|720p)(?=$|\s)/g,
];

/**
 * Clean a YouTube video title and split it into artist / track.
 */
export function cleanVideoTitle(title: string): {
    artist: string;
    track: string;
} {
    let cleaned = title;
    for (const pattern of NOISE_PATTERNS) {
        cleaned = cleaned.replace(pattern, ' ');
    }
    cleaned = cleaned
        .replace(/\bft\.\s*/gi, 'feat. ')
        .replace(/\bfeat\s+/gi, 'feat. ')
        .replace(/\s+/g, ' ')
        .trim();

    let artist = '';
    let track = cleaned;

    if (cleaned.includes(' | ')) {
        const parts = cleaned.split(' | ');
        if (parts[0].includes('"')) {
            const trackMatch = parts[0].match(/"([^"]+)"/);
            if (trackMatch) {
                track = trackMatch[1].trim();
                artist = parts[parts.length - 1].trim();
            }
        } else if (parts[parts.length - 1].includes(',')) {
            track = parts[0].trim();
            artist = parts[parts.length - 1].trim();
        } else if (parts[0].length < parts[1].length) {
            artist = parts[0].trim();
            track = parts[1].trim();
        } else {
            track = parts[0].trim();
            artist = parts[1].trim();
        }
    } else if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        artist = parts[0].trim();
        track = parts.slice(1).join(' - ').trim();
    } else if (/\s+[–—]\s+/.test(cleaned)) {
        const parts = cleaned.split(/\s+[–—]\s+/);
        artist = parts[0].trim();
        track = parts.slice(1).join(' - ').trim();
    }

    if (!artist && !track) track = cleaned;
    return { artist, track };
}

/**
 * Extract a YouTube video ID from any common URL form.
 */
export function getVideoId(url?: string): string | null {
    const target = url || window.location.href;

    try {
        const u = new URL(target);
        const v = u.searchParams.get('v');
        if (v) return v;
    } catch {
        /* not a URL */
    }

    const patterns = [
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        /[?&]v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const re of patterns) {
        const m = target.match(re);
        if (m) return m[1];
    }
    return null;
}

const YT_MUSIC_TITLE_SELECTORS = [
    'ytmusic-player-bar .title.ytmusic-player-bar',
    'ytmusic-player-bar .content-info-wrapper .title',
    '.ytmusic-player-bar .title',
    'ytmusic-player-bar yt-formatted-string.title',
    '.content-info-wrapper yt-formatted-string.title',
];

const YT_TITLE_SELECTORS = [
    '#title h1 yt-formatted-string',
    'h1.ytd-video-primary-info-renderer yt-formatted-string',
    '#above-the-fold #title yt-formatted-string',
    'ytd-watch-metadata #title yt-formatted-string',
    '#info-contents h1',
    'h1.title',
];

export function getVideoTitle(): string {
    for (const selector of YT_MUSIC_TITLE_SELECTORS) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) return text;
    }
    for (const selector of YT_TITLE_SELECTORS) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) return text;
    }
    return document.title
        .replace(' - YouTube Music', '')
        .replace(' - YouTube', '')
        .trim();
}

function uniqueNonEmpty(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const normalized = value.replace(/\s+/g, ' ').trim();
        const key = normalized.toLowerCase();
        if (!normalized || seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

function stripDecorators(value: string): string {
    return value
        .replace(/\(\s*from\s+["'][^"']+["']\s*\)/gi, '')
        .replace(/\[\s*from\s+["'][^"']+["']\s*\]/gi, '')
        .replace(
            /\([^)]*(official|music\s*video|lyric|lyrics|lyrical|full\s*video|full\s*song|audio|visualizer|4k|hd|hq|1080p|720p)[^)]*\)/gi,
            '',
        )
        .replace(
            /\[[^\]]*(official|music\s*video|lyric|lyrics|lyrical|full\s*video|full\s*song|audio|visualizer|4k|hd|hq|1080p|720p)[^\]]*\]/gi,
            '',
        )
        .replace(
            /\b(official|music\s*video|lyric\s*video|lyrics\s*video|lyrical\s*video|full\s*video|full\s*song|audio|visualizer|4k|hd|hq|1080p|720p)\b/gi,
            '',
        )
        .replace(/\s+/g, ' ')
        .trim();
}

function splitPeople(value: string): string[] {
    return value
        .split(/\s*(?:,|&|\band\b|\/|\+)\s*/i)
        .map((part) =>
            cleanArtistText(
                part.replace(
                    /\b(feat|ft|with|singer|singers|music|lyrics?|composer|starring)\b\.?/gi,
                    '',
                ),
            ),
        )
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
    reason: string,
) {
    const cleanArtist = stripDecorators(artist);
    const cleanTrack = stripDecorators(track);
    if (!cleanTrack || cleanTrack.length < 2) return;

    const key = `${cleanArtist.toLowerCase()}|${cleanTrack.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
        artist: cleanArtist,
        track: cleanTrack,
        query: makeQuery(cleanArtist, cleanTrack),
        reason,
    });
}

export function getLyricsSearchCandidates(
    rawTitle: string,
    info?: Partial<CurrentTrackInfo>,
): LyricsSearchCandidate[] {
    const title = rawTitle.replace(/\s+/g, ' ').trim();
    const parsed = cleanVideoTitle(title);
    const pipeParts = uniqueNonEmpty(title.split('|').map(stripDecorators));
    const mainPart = pipeParts[0] || stripDecorators(title);
    const contributorParts = pipeParts.slice(1);
    const colonParts = mainPart.split(/\s*:\s*/).map(stripDecorators).filter(Boolean);

    const titleWithoutChannel = stripDecorators(
        mainPart.replace(/\s+-\s+Topic$/i, ''),
    );
    const trackSeeds = uniqueNonEmpty([
        colonParts.length > 1 ? colonParts[colonParts.length - 1] : '',
        parsed.track,
        titleWithoutChannel,
        colonParts.length > 1 ? colonParts.join(' ') : '',
        colonParts[0] || '',
    ]);

    const artistSeeds = uniqueNonEmpty(
        [
            ...(info?.artist ? splitPeople(info.artist) : []),
            ...(parsed.artist ? splitPeople(parsed.artist) : []),
            ...contributorParts.flatMap(splitPeople),
        ].flatMap(artistVariants),
    ).slice(0, 10);

    const mediaOnlyTrack =
        info?.title && !titleWithoutChannel ? info.title : '';
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
        addCandidate(
            candidates,
            seen,
            parsed.track,
            parsed.artist,
            'swapped artist-track',
        );
    }

    return candidates.slice(0, 24);
}

function getFirstText(selectors: string[]): string {
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) return text.replace(/\s+/g, ' ');
    }
    return '';
}

function getMediaSessionInfo(): {
    title: string;
    artist: string;
    album: string;
} {
    const metadata = (navigator as any).mediaSession?.metadata;
    return {
        title: metadata?.title?.trim?.() || '',
        artist: metadata?.artist?.trim?.() || '',
        album: metadata?.album?.trim?.() || '',
    };
}

const YT_MUSIC_ARTIST_SELECTORS = [
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

const YT_ARTIST_SELECTORS = [
    'ytd-watch-metadata ytd-video-owner-renderer #channel-name a',
    '#owner #channel-name a',
    '#upload-info #channel-name a',
];

export function getVideoArtist(): string {
    const isYouTubeMusic = window.location.hostname === 'music.youtube.com';
    const text = getFirstText(
        isYouTubeMusic ? YT_MUSIC_ARTIST_SELECTORS : YT_ARTIST_SELECTORS,
    );
    return cleanArtistText(text);
}

function normalizeTrackPart(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getCurrentTrackInfo(): CurrentTrackInfo {
    const media = getMediaSessionInfo();
    const pageTitle = getVideoTitle();
    const parsed = cleanVideoTitle(pageTitle);
    const isYouTubeMusic = window.location.hostname === 'music.youtube.com';
    const title = isYouTubeMusic
        ? media.title || parsed.track || pageTitle
        : parsed.track || pageTitle || media.title;
    const artist = media.artist || getVideoArtist() || parsed.artist;
    const album = media.album || '';
    const videoId = getVideoId();
    const signature = [videoId || '', title, artist, album]
        .map(normalizeTrackPart)
        .filter(Boolean)
        .join('|');

    return {
        rawTitle: pageTitle,
        title,
        artist,
        album,
        videoId,
        signature,
    };
}

export function getLyricsSearchTitle(
    info: CurrentTrackInfo = getCurrentTrackInfo(),
): string {
    if (
        info.artist &&
        info.title.toLowerCase().startsWith(`${info.artist.toLowerCase()} - `)
    ) {
        return info.title;
    }
    if (info.artist) return `${info.artist} - ${info.title}`;
    return info.title;
}

export function getFullText(transcript: LyricLine[]): string {
    if (!transcript || transcript.length === 0) return '';
    return transcript
        .map((line) => line.text.trim())
        .filter((text) => text.length > 0)
        .join(' ');
}

export function getTranscript(
    transcript: LyricLine[],
): Array<{ start: number; text: string }> {
    return transcript.map((line) => ({
        start: line.start,
        text: line.text,
    }));
}
