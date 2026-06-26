import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const requireText = (text, pattern, label) => {
    if (!pattern.test(text)) throw new Error(`Missing ${label}`);
};

await access(path.join(root, 'src/assets/fonts/Inter-Regular.woff2'));
await access(path.join(root, 'src/assets/fonts/Inter-Bold.woff2'));
await access(path.join(root, 'src/assets/fonts/InstrumentSans-Regular.woff2'));
await access(path.join(root, 'src/assets/fonts/InstrumentSans-Bold.woff2'));

const sharedFont = await read('src/shared/appFonts.ts');
requireText(sharedFont, /Inter-Regular\.woff2\?inline['"]/, 'Inter regular WOFF2 inline import');
requireText(sharedFont, /Inter-Bold\.woff2\?inline['"]/, 'Inter bold WOFF2 inline import');
requireText(
    sharedFont,
    /InstrumentSans-Regular\.woff2\?inline['"]/,
    'Instrument Sans regular WOFF2 inline import',
);
requireText(
    sharedFont,
    /InstrumentSans-Bold\.woff2\?inline['"]/,
    'Instrument Sans bold WOFF2 inline import',
);
requireText(sharedFont, /new FontFaceConstructor\(/, 'target-document FontFace construction');
requireText(sharedFont, /targetDocument\.fonts\.add\(/, 'document FontFace registration');
requireText(sharedFont, /WeakMap<Document,\s*Promise<void>>/, 'per-document font loading cache');
requireText(sharedFont, /dataUrlToArrayBuffer/, 'data URL to ArrayBuffer decoder');
if (/new FontFaceConstructor\([^)]*url\(/.test(sharedFont)) {
    throw new Error('FontFace must use ArrayBuffer, not url() - CSP blocks URL-backed fonts');
}

const panelCss = await read('src/content/styles/panel.css');
const popupCss = await read('src/popup/popup.css');
requireText(panelCss, /font-family:\s*['"]Instrument Sans['"]\s*,\s*['"]Inter['"]\s*,/, 'panel app font stack');
requireText(popupCss, /font-family:\s*['"]Instrument Sans['"]\s*,\s*['"]Inter['"]\s*,/, 'popup app font stack');

const contentEntry = await read('src/content/index.tsx');
const popupEntry = await read('src/popup/popup.js');
const appEntry = await read('src/content/App.tsx');
requireText(contentEntry, /loadAppFonts\(document\)/, 'owner document font loading');
requireText(popupEntry, /loadAppFonts\(document\)/, 'options document font loading');
requireText(appEntry, /loadAppFonts\(pipWin\.document\)/, 'PiP document font loading');
requireText(appEntry, /documentPictureInPicture\.requestWindow/, 'native Document PiP request');
if (/window\.open\s*\(/.test(appEntry)) {
    throw new Error('Normal popup fallback must not be used for always-on-top PiP');
}

const dist = path.join(root, 'dist');
await access(dist);
const files = await readdir(dist, { recursive: true });
const bundles = files.filter((file) => /\.(?:js|css)$/.test(file));
let hasEmbeddedFont = false;
for (const file of bundles) {
    const output = await readFile(path.join(dist, file), 'utf8');
    if (/data:font\/woff2;base64,/.test(output)) {
        hasEmbeddedFont = true;
        break;
    }
}
if (!hasEmbeddedFont) throw new Error('Built output does not contain embedded WOFF2 font data');

console.log('App font source and build verification passed.');
