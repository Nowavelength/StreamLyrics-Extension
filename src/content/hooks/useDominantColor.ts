import { useState, useEffect, useRef } from 'react';
import { extractDominantColor, getThumbnailUrl } from '../utils/colorExtractor';
import { getVideoId } from '../utils/transcriptParser';

const FALLBACK_COLOR = '#8B3A3A';

/**
 * Get thumbnail URL from YouTube Music player or YouTube
 */
function getCurrentThumbnailUrl(): string | null {
    // YouTube Music: Get from player bar thumbnail
    const ytMusicThumb = document.querySelector('ytmusic-player-bar img.image') as HTMLImageElement;
    if (ytMusicThumb?.src) {
        return ytMusicThumb.src;
    }

    // YouTube Music: Album art in player
    const ytMusicArt = document.querySelector('.ytmusic-player img') as HTMLImageElement;
    if (ytMusicArt?.src) {
        return ytMusicArt.src;
    }

    // YouTube: Use video ID for thumbnail
    const videoId = getVideoId();
    if (videoId) {
        return getThumbnailUrl(videoId);
    }

    return null;
}

/**
 * Hook for extracting dominant color from video/track thumbnail
 * Works for both YouTube and YouTube Music
 */
export function useDominantColor(): string {
    const [color, setColor] = useState(FALLBACK_COLOR);
    const lastThumbnailRef = useRef<string>('');
    const extractingRef = useRef(false);

    const extractColor = async (thumbnailUrl: string) => {
        if (!thumbnailUrl || thumbnailUrl === lastThumbnailRef.current || extractingRef.current) {
            return;
        }

        extractingRef.current = true;
        lastThumbnailRef.current = thumbnailUrl;

        try {
            console.log('[StreamLyrics] Extracting color from:', thumbnailUrl);
            const dominantColor = await extractDominantColor(thumbnailUrl);
            setColor(dominantColor);
        } catch (error) {
            console.error('[StreamLyrics] Error extracting color:', error);
            setColor(FALLBACK_COLOR);
        } finally {
            extractingRef.current = false;
        }
    };

    // Initial color extraction
    useEffect(() => {
        const init = async () => {
            // Try immediately
            const url = getCurrentThumbnailUrl();
            if (url) {
                extractColor(url);
            } else {
                // Wait a bit for page to load
                setTimeout(() => {
                    const delayedUrl = getCurrentThumbnailUrl();
                    if (delayedUrl) extractColor(delayedUrl);
                }, 1500);
            }
        };
        init();
    }, []);

    // Watch for thumbnail changes (especially for YouTube Music)
    useEffect(() => {
        const checkInterval = setInterval(() => {
            const currentUrl = getCurrentThumbnailUrl();
            if (currentUrl && currentUrl !== lastThumbnailRef.current) {
                extractColor(currentUrl);
            }
        }, 2000); // Check every 2 seconds

        return () => clearInterval(checkInterval);
    }, []);

    // Also observe DOM for URL changes (YouTube SPA)
    useEffect(() => {
        let lastVideoId = getVideoId();

        const observer = new MutationObserver(() => {
            const currentVideoId = getVideoId();

            if (currentVideoId && currentVideoId !== lastVideoId) {
                lastVideoId = currentVideoId;
                const thumbnailUrl = getThumbnailUrl(currentVideoId);
                extractColor(thumbnailUrl);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        return () => observer.disconnect();
    }, []);

    return color;
}
