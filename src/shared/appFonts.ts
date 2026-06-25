import interRegularUrl from '../assets/fonts/Inter-Regular.woff2?inline';
import interBoldUrl from '../assets/fonts/Inter-Bold.woff2?inline';
import instrumentRegularUrl from '../assets/fonts/InstrumentSans-Regular.woff2?inline';
import instrumentBoldUrl from '../assets/fonts/InstrumentSans-Bold.woff2?inline';

/**
 * StreamLyrics bundled-font loader.
 *
 * YouTube and YouTube Music ship a restrictive `font-src` Content Security
 * Policy that rejects URL-backed `FontFace` construction (even data URLs are
 * treated as a network source on some pages). The CSP-safe path is to decode
 * the bundled font bytes into an `ArrayBuffer` and build the `FontFace` from
 * the binary buffer — no font URL is ever resolved.
 *
 * Two families are registered:
 *   - `Inter`           — lyric text (Regular 400 / Bold 700).
 *   - `Instrument Sans` — track title + artist metadata (Regular 400 / Bold 700).
 *
 * Loading is memoized per `Document` so Shadow DOM, the owner page, and the
 * Document PiP window each register the faces exactly once.
 */

const fontLoadByDocument = new WeakMap<Document, Promise<void>>();

interface FontSpec {
    family: string;
    dataUrl: string;
    weight: string;
}

const FONT_SPECS: FontSpec[] = [
    { family: 'Inter', dataUrl: interRegularUrl, weight: '400' },
    { family: 'Inter', dataUrl: interBoldUrl, weight: '700' },
    { family: 'Instrument Sans', dataUrl: instrumentRegularUrl, weight: '400' },
    { family: 'Instrument Sans', dataUrl: instrumentBoldUrl, weight: '700' },
];

/** Decode a data-URL (or plain base64 string) into an ArrayBuffer. */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export function loadAppFonts(targetDocument: Document): Promise<void> {
    const existingLoad = fontLoadByDocument.get(targetDocument);
    if (existingLoad) return existingLoad;

    const load = (async () => {
        const FontFaceConstructor = targetDocument.defaultView?.FontFace;
        if (!FontFaceConstructor || !targetDocument.fonts) {
            console.warn('[StreamLyrics] FontFace API unavailable; using system font fallback.');
            return;
        }

        await Promise.all(
            FONT_SPECS.map(async (spec) => {
                try {
                    const buffer = dataUrlToArrayBuffer(spec.dataUrl);
                    const face = new FontFaceConstructor(spec.family, buffer, {
                        style: 'normal',
                        weight: spec.weight,
                        display: 'swap',
                    });
                    const loaded = await face.load();
                    targetDocument.fonts.add(loaded);
                } catch (error) {
                    console.warn(
                        `[StreamLyrics] Failed to load bundled font ${spec.family} ${spec.weight}:`,
                        error,
                    );
                }
            }),
        );
    })();

    fontLoadByDocument.set(targetDocument, load);
    return load;
}
