import gothamBookUrl from '../assets/fonts/GothamBook.ttf';
import gothamMediumUrl from '../assets/fonts/GothamMedium.ttf';
import gothamBoldUrl from '../assets/fonts/GothamBold.ttf';

const fontLoadByDocument = new WeakMap<Document, Promise<void>>();

/** Decode a data-URL (or plain base64 string) into an ArrayBuffer. */
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
    // Strip the data-URL prefix if present (e.g. "data:font/ttf;base64,...")
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export function loadGothamFont(targetDocument: Document): Promise<void> {
    const existingLoad = fontLoadByDocument.get(targetDocument);
    if (existingLoad) return existingLoad;

    const load = (async () => {
        const FontFaceConstructor = targetDocument.defaultView?.FontFace;
        if (!FontFaceConstructor || !targetDocument.fonts) {
            console.warn('[StreamLyrics] FontFace API unavailable; using system font fallback.');
            return;
        }

        try {
            // Load and register Gotham Book (400)
            const bookBuffer = dataUrlToArrayBuffer(gothamBookUrl);
            const faceBook = new FontFaceConstructor(
                'Gotham',
                bookBuffer,
                {
                    style: 'normal',
                    weight: '400',
                    display: 'swap',
                },
            );
            const loadedBook = await faceBook.load();
            targetDocument.fonts.add(loadedBook);

            // Load and register Gotham Medium (500)
            const mediumBuffer = dataUrlToArrayBuffer(gothamMediumUrl);
            const faceMedium = new FontFaceConstructor(
                'Gotham',
                mediumBuffer,
                {
                    style: 'normal',
                    weight: '500',
                    display: 'swap',
                },
            );
            const loadedMedium = await faceMedium.load();
            targetDocument.fonts.add(loadedMedium);

            // Load and register Gotham Bold (700)
            const boldBuffer = dataUrlToArrayBuffer(gothamBoldUrl);
            const faceBold = new FontFaceConstructor(
                'Gotham',
                boldBuffer,
                {
                    style: 'normal',
                    weight: '700',
                    display: 'swap',
                },
            );
            const loadedBold = await faceBold.load();
            targetDocument.fonts.add(loadedBold);
        } catch (error) {
            console.warn('[StreamLyrics] Failed to load bundled Gotham font:', error);
        }
    })();

    fontLoadByDocument.set(targetDocument, load);
    return load;
}
