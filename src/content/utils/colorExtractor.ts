// @ts-ignore — colorthief has no types
import ColorThief from 'colorthief';

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

