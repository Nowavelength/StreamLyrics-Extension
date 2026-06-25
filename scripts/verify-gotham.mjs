import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const requireText = (text, pattern, label) => {
    if (!pattern.test(text)) throw new Error(`Missing ${label}`);
};

await access(path.join(root, 'src/assets/fonts/GothamBook.ttf'));
await access(path.join(root, 'src/assets/fonts/GothamMedium.ttf'));
await access(path.join(root, 'src/assets/fonts/GothamBold.ttf'));
await access(path.join(root, 'THIRD_PARTY_LICENSES/Gotham-License.txt'));

const sharedFont = await read('src/shared/gothamFont.ts');
requireText(sharedFont, /GothamBook\.ttf['"]/, 'GothamBook TTF import');
requireText(sharedFont, /GothamMedium\.ttf['"]/, 'GothamMedium TTF import');
requireText(sharedFont, /GothamBold\.ttf['"]/, 'GothamBold TTF import');
requireText(sharedFont, /new FontFaceConstructor\(/, 'target-document FontFace construction');
requireText(sharedFont, /targetDocument\.fonts\.add\(/, 'document FontFace registration');
requireText(sharedFont, /WeakMap<Document,\s*Promise<void>>/, 'per-document font loading cache');
requireText(sharedFont, /dataUrlToArrayBuffer/, 'data URL to ArrayBuffer decoder for CSP-safe font loading');
if (/new FontFaceConstructor\([^)]*url\(/.test(sharedFont)) {
    throw new Error('FontFace must use ArrayBuffer, not url() — CSP blocks URL-backed fonts');
}

const panelCss = await read('src/content/styles/panel.css');
const popupCss = await read('src/popup/popup.css');
requireText(panelCss, /font-family:\s*['"]Gotham['"]\s*,/, 'Gotham-first panel stack');
requireText(popupCss, /font-family:\s*['"]Gotham['"]\s*,/, 'Gotham-first popup stack');
requireText(panelCss, /\.lyric-line\s*\{[^}]*text-align:\s*left/, 'left-aligned full-mode lyric lines');

const contentEntry = await read('src/content/index.tsx');
const popupEntry = await read('src/popup/popup.js');
const appEntry = await read('src/content/App.tsx');
requireText(contentEntry, /loadGothamFont\(document\)/, 'owner document font loading');
requireText(popupEntry, /loadGothamFont\(document\)/, 'options document font loading');
requireText(appEntry, /loadGothamFont\(pipWin\.document\)/, 'PiP document font loading');
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
    if (/data:(?:font\/ttf|font\/sfnt|application\/font-sfnt|application\/octet-stream);base64,/.test(output)) {
        hasEmbeddedFont = true;
        break;
    }
}
if (!hasEmbeddedFont) throw new Error('Built output does not contain embedded Gotham TTF data');

console.log('Gotham source and build verification passed.');
