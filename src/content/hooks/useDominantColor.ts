import { useState, useEffect, useRef } from 'react';
import { extractDominantColor } from '../utils/colorExtractor';

const FALLBACK_COLOR = '#8B3A3A';

/**
 * Hook for extracting dominant color from video/track thumbnail
 * Works reactively based on the passed thumbnailUrl
 */
export function useDominantColor(thumbnailUrl: string | null): string {
    const [color, setColor] = useState(FALLBACK_COLOR);
    const lastThumbnailRef = useRef<string>('');
    const extractingRef = useRef(false);

    useEffect(() => {
        if (!thumbnailUrl) {
            setColor(FALLBACK_COLOR);
            return;
        }

        const extractColor = async (url: string) => {
            if (url === lastThumbnailRef.current || extractingRef.current) {
                return;
            }

            extractingRef.current = true;
            lastThumbnailRef.current = url;

            try {
                console.log('[StreamLyrics] Extracting color from:', url);
                const dominantColor = await extractDominantColor(url);
                setColor(dominantColor);
            } catch (error) {
                console.error('[StreamLyrics] Error extracting color:', error);
                setColor(FALLBACK_COLOR);
            } finally {
                extractingRef.current = false;
            }
        };

        extractColor(thumbnailUrl);
    }, [thumbnailUrl]);

    return color;
}
