import manropeFontDataUrl from '../assets/fonts/Manrope-Variable.woff2';

const fontLoadByDocument = new WeakMap<Document, Promise<void>>();

export function loadManropeFont(targetDocument: Document): Promise<void> {
    const existingLoad = fontLoadByDocument.get(targetDocument);
    if (existingLoad) return existingLoad;

    const load = (async () => {
        const FontFaceConstructor = targetDocument.defaultView?.FontFace;
        if (!FontFaceConstructor || !targetDocument.fonts) {
            console.warn('[StreamLyrics] FontFace API unavailable; using system font fallback.');
            return;
        }

        try {
            const face = new FontFaceConstructor(
                'Manrope',
                `url('${manropeFontDataUrl}') format('woff2')`,
                {
                    style: 'normal',
                    weight: '200 800',
                    display: 'swap',
                },
            );
            const loadedFace = await face.load();
            targetDocument.fonts.add(loadedFace);
        } catch (error) {
            console.warn('[StreamLyrics] Failed to load bundled Manrope font:', error);
        }
    })();

    fontLoadByDocument.set(targetDocument, load);
    return load;
}
