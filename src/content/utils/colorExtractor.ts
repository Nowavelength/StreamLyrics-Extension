/**
 * Color extraction utilities using canvas
 * Simplified implementation without external dependencies
 */

interface RGB {
    r: number;
    g: number;
    b: number;
}

/**
 * Extract dominant color from an image URL
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
    try {
        const img = await loadImage(imageUrl);
        const color = getDominantColorFromImage(img);
        const adjusted = adjustColorForReadability(color);
        return rgbToHex(adjusted);
    } catch (error) {
        console.error('Error extracting color:', error);
        return '#8B3A3A'; // Fallback color
    }
}

/**
 * Load an image and return it as HTMLImageElement
 */
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

/**
 * Get dominant color from image using canvas sampling
 */
function getDominantColorFromImage(img: HTMLImageElement): RGB {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return { r: 139, g: 58, b: 58 }; // Fallback
    }

    // Scale down for performance
    const maxSize = 50;
    const scale = Math.min(maxSize / img.width, maxSize / img.height);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Simple color averaging with some weighting toward saturated colors
    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
        const pr = data[i];
        const pg = data[i + 1];
        const pb = data[i + 2];

        // Skip very light or very dark pixels
        const brightness = (pr + pg + pb) / 3;
        if (brightness > 30 && brightness < 220) {
            r += pr;
            g += pg;
            b += pb;
            count++;
        }
    }

    if (count === 0) {
        return { r: 139, g: 58, b: 58 }; // Fallback
    }

    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
    };
}

/**
 * Adjust color brightness for text readability
 * Darkens bright colors by 20%
 */
function adjustColorForReadability(color: RGB): RGB {
    const brightness = calculatePerceivedBrightness(color);

    // If too bright, darken by 20%
    if (brightness > 150) {
        return {
            r: Math.round(color.r * 0.8),
            g: Math.round(color.g * 0.8),
            b: Math.round(color.b * 0.8),
        };
    }

    // If too dark, lighten slightly
    if (brightness < 50) {
        return {
            r: Math.min(255, Math.round(color.r * 1.3)),
            g: Math.min(255, Math.round(color.g * 1.3)),
            b: Math.min(255, Math.round(color.b * 1.3)),
        };
    }

    return color;
}

/**
 * Calculate perceived brightness using standard formula
 */
function calculatePerceivedBrightness(color: RGB): number {
    return (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
}

/**
 * Convert RGB to hex string
 */
function rgbToHex(color: RGB): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Get YouTube video thumbnail URL
 */
export function getThumbnailUrl(videoId: string): string {
    // Try maxresdefault first, fall back to hqdefault
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}
