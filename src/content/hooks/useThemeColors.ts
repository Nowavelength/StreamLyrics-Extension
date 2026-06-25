import { useState, useEffect, useRef } from 'react';
import { extractThemeColors, ThemeColors } from '../utils/colorExtractor';

const FALLBACK: ThemeColors = { dominant: '#8B3A3A', dark: '#0a0a0a' };

/**
 * Extract a full theme (dominant + dark) from a thumbnail URL.
 *   - `dominant` drives the Normal-mode background and progress fills.
 *   - `dark` drives the Mini-mode background (Ultra stays pure black).
 * Reactive to `thumbnailUrl`; cached per URL inside the extractor.
 */
export function useThemeColors(thumbnailUrl: string | null): ThemeColors {
    const [colors, setColors] = useState<ThemeColors>(FALLBACK);
    const lastThumbnailRef = useRef<string>('');
    const extractingRef = useRef(false);

    useEffect(() => {
        if (!thumbnailUrl) {
            setColors(FALLBACK);
            lastThumbnailRef.current = '';
            return;
        }

        const url = thumbnailUrl;
        if (url === lastThumbnailRef.current || extractingRef.current) return;

        extractingRef.current = true;
        lastThumbnailRef.current = url;

        extractThemeColors(url)
            .then(setColors)
            .catch(() => setColors(FALLBACK))
            .finally(() => {
                extractingRef.current = false;
            });
    }, [thumbnailUrl]);

    return colors;
}
