import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const requireText = (text, pattern, label) => {
    if (!pattern.test(text)) throw new Error(`Missing ${label}`);
};

await access(path.join(root, 'src/assets/fonts/Manrope-Variable.woff2'));
await access(path.join(root, 'THIRD_PARTY_LICENSES/Manrope-OFL.txt'));

const sharedFont = await read('src/shared/manropeFont.ts');
requireText(sharedFont, /Manrope-Variable\.woff2['"]/, 'Manrope WOFF2 import');
requireText(sharedFont, /font-family:\s*['"]Manrope['"]/, 'Manrope @font-face family');
requireText(sharedFont, /font-weight:\s*200 800/, 'Manrope variable weight range');

const panelCss = await read('src/content/styles/panel.css');
const popupCss = await read('src/popup/popup.css');
requireText(panelCss, /font-family:\s*['"]Manrope['"]\s*,/, 'Manrope-first panel stack');
requireText(popupCss, /font-family:\s*['"]Manrope['"]\s*,/, 'Manrope-first popup stack');

const contentEntry = await read('src/content/index.tsx');
const popupEntry = await read('src/popup/popup.js');
requireText(contentEntry, /withManropeFontFace\(panelStyles\)/, 'content font-face injection');
requireText(popupEntry, /MANROPE_FONT_FACE/, 'popup font-face injection');

const dist = path.join(root, 'dist');
await access(dist);
const files = await readdir(dist, { recursive: true });
const bundles = files.filter((file) => /\.(?:js|css)$/.test(file));
let hasEmbeddedFont = false;
for (const file of bundles) {
    const output = await readFile(path.join(dist, file), 'utf8');
    if (/data:(?:font\/woff2|application\/font-woff2|application\/octet-stream);base64,/.test(output)) {
        hasEmbeddedFont = true;
        break;
    }
}
if (!hasEmbeddedFont) throw new Error('Built output does not contain embedded Manrope WOFF2 data');

console.log('Manrope source and build verification passed.');
