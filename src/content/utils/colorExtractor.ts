// @ts-ignore — colorthief has no types
import ColorThiefImport from 'colorthief';

// colorthief ships both node and browser builds; the resolved typings aren't
// constructable under our tsconfig, so treat the default export as a ctor.
const ColorThief: any = ColorThiefImport;

interface RGB {
    r: number;
    g: number;
    b: number;
}

const FALLBACK_HEX = '#8B3A3A';

// In-memory cache keyed by image URL.
const colorCache = new Map<string, string>();

/**
 * Extract the dominant color from an image URL.
 * Uses ColorThief's median-cut quantization (real dominant color, not RGB
 * average). Result is cached per URL.
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
    if (colorCache.has(imageUrl)) return colorCache.get(imageUrl)!;

    try {
        const img = await loadImage(imageUrl);
        const thief = new ColorThief();
        // [r, g, b]
        const rgb: [number, number, number] = thief.getColor(img);
        const adjusted = adjustForReadability({
            r: rgb[0],
            g: rgb[1],
            b: rgb[2],
        });
        const hex = rgbToHex(adjusted);
        colorCache.set(imageUrl, hex);
        return hex;
    } catch (err) {
        console.warn('[StreamLyrics] Color extraction failed, using fallback:', err);
        return FALLBACK_HEX;
    }
}

/**
 * Theme colors derived from a single thumbnail.
 *   - `dominant`: the readability-adjusted dominant color (Normal-mode bg).
 *   - `dark`:     a deep, dark shade pulled from the palette (Mini-mode bg).
 *                 Falls back to near-black when the art has no dark tones.
 */
export interface ThemeColors {
    dominant: string;
    dark: string;
}

const NEAR_BLACK = '#0a0a0a';
const themeCache = new Map<string, ThemeColors>();

function luminance({ r, g, b }: RGB): number {
    return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Extract both the dominant color and a dark background color from one image.
 * The dark color is the lowest-luminance palette swatch, then clamped down so
 * it always reads as a proper dark surface. Result cached per URL.
 */
export async function extractThemeColors(imageUrl: string): Promise<ThemeColors> {
    if (themeCache.has(imageUrl)) return themeCache.get(imageUrl)!;

    try {
        const img = await loadImage(imageUrl);
        const thief = new ColorThief();

        const dominantRgb: [number, number, number] = thief.getColor(img);
        const dominant = rgbToHex(
            adjustForReadability({ r: dominantRgb[0], g: dominantRgb[1], b: dominantRgb[2] }),
        );

        let dark = NEAR_BLACK;
        try {
            const palette: [number, number, number][] = thief.getPalette(img, 8) || [];
            const swatches = palette.map(([r, g, b]) => ({ r, g, b }));
            // Include the dominant in the candidate set.
            swatches.push({ r: dominantRgb[0], g: dominantRgb[1], b: dominantRgb[2] });
            if (swatches.length) {
                const darkest = swatches.reduce((a, b) =>
                    luminance(a) <= luminance(b) ? a : b,
                );
                // Clamp the darkest swatch toward a deep surface (L <= ~16%)
                // while keeping its hue, so it harmonizes with the artwork.
                const [h, s] = rgbToHsl(darkest.r, darkest.g, darkest.b);
                const targetL = Math.min(13, luminance(darkest) / 255 * 100);
                dark = rgbToHex(hslToRgb(h, Math.min(s, 45), Math.max(6, targetL)));
            }
        } catch {
            dark = NEAR_BLACK;
        }

        const colors: ThemeColors = { dominant, dark };
        themeCache.set(imageUrl, colors);
        return colors;
    } catch (err) {
        console.warn('[StreamLyrics] Theme extraction failed, using fallback:', err);
        return { dominant: FALLBACK_HEX, dark: NEAR_BLACK };
    }
}

/** Multiply a hex color toward black by `factor` (0 = unchanged, 1 = black). */
export function darken(hex: string, factor = 0.4): string {
    const rgb = hexToRgbObj(hex);
    if (!rgb) return hex;
    const f = Math.max(0, Math.min(1, factor));
    return rgbToHex({
        r: Math.round(rgb.r * (1 - f)),
        g: Math.round(rgb.g * (1 - f)),
        b: Math.round(rgb.b * (1 - f)),
    });
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}

/**
 * Darken bright colors / brighten dark colors so text stays readable on top.
 */
function adjustForReadability(color: RGB): RGB {
    const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    if (brightness > 150) {
        return {
            r: Math.round(color.r * 0.7),
            g: Math.round(color.g * 0.7),
            b: Math.round(color.b * 0.7),
        };
    }
    if (brightness < 50) {
        return {
            r: Math.min(255, Math.round(color.r * 1.4)),
            g: Math.min(255, Math.round(color.g * 1.4)),
            b: Math.min(255, Math.round(color.b * 1.4)),
        };
    }
    return color;
}

function rgbToHex({ r, g, b }: RGB): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ---------- Vibrant accent ----------------------------------------------

function hexToRgbObj(hex: string): RGB | null {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
    };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): RGB {
    h /= 360; s /= 100; l /= 100;
    if (s === 0) {
        const v = Math.round(l * 255);
        return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return {
        r: Math.round(hue2rgb(h + 1 / 3) * 255),
        g: Math.round(hue2rgb(h) * 255),
        b: Math.round(hue2rgb(h - 1 / 3) * 255),
    };
}

/**
 * Take a (potentially muted) dominant color and produce a more saturated
 * vibrant accent — useful for foreground bars / highlights that should pop
 * over the background. Returns rgba() so callers get sensible default alpha.
 */
export function vibrantize(hex: string, alpha = 0.92): string {
    const rgb = hexToRgbObj(hex);
    if (!rgb) return `rgba(255, 255, 255, ${alpha})`;
    const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    // Boost saturation, pull lightness toward ~62% (vivid territory).
    const newS = Math.min(100, s + 30);
    const newL = Math.max(50, Math.min(72, l + (62 - l) * 0.45));
    const out = hslToRgb(h, newS, newL);
    return `rgba(${out.r}, ${out.g}, ${out.b}, ${alpha})`;
}

/**
 * YouTube video thumbnail URL (max-resolution).
 */
export function getThumbnailUrl(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Upgrade a standard/low-res Google User Content or YouTube thumbnail URL 
 * into a high-resolution version (e.g. w544-h544 or maxresdefault).
 */
export function getHighResThumbnailUrl(url: string | null): string | null {
    if (!url) return null;

    // 1. YouTube Video Thumbnails
    if (url.includes('img.youtube.com') || url.includes('i.ytimg.com')) {
        return url.replace(/\/(default|hqdefault|mqdefault|sddefault)\.jpg/, '/maxresdefault.jpg');
    }

    // 2. Google User Content CDN URLs (YouTube Music Album Art)
    if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
        let upgraded = url.replace(/=w\d+-h\d+/, '=w544-h544');
        upgraded = upgraded.replace(/=s\d+/, '=s544');
        upgraded = upgraded.replace(/\/w\d+-h\d+\//, '/w544-h544/');
        upgraded = upgraded.replace(/\/s\d+\//, '/s544/');
        return upgraded;
    }

    return url;
}

