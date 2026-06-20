# Manrope Font Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle Manrope into StreamLyrics for a consistent Spotify-like interface and install the same font for the current Linux user.

**Architecture:** Acquire Fontsource's Manrope Latin variable WOFF2 once, then commit it under StreamLyrics' own asset directory as the canonical font asset. A small shared TypeScript module converts the imported data URL into one reusable `@font-face` rule; the content script prepends it to the CSS injected into both Shadow DOM and PiP, while the options script injects the same rule into its document.

**Tech Stack:** TypeScript, JavaScript ES modules, Vite 5, CRXJS, CSS, Fontsource Manrope, Fontconfig.

## Global Constraints

- Do not obtain, bundle, or imitate proprietary Circular font files.
- Do not load fonts from Google Fonts, a CDN, or any runtime network resource.
- Keep the existing system font stack after Manrope as a fallback.
- Do not change font sizes, lyric spacing, player thresholds, or layout behavior.
- Include the Manrope SIL Open Font License notice.
- Install the desktop font for the current user without using or storing an administrator password.

---

### Task 1: Bundle and apply Manrope

**Files:**
- Create: `scripts/verify-manrope.mjs`
- Create: `src/assets/fonts/Manrope-Variable.woff2`
- Create: `src/shared/manropeFont.ts`
- Create: `THIRD_PARTY_LICENSES/Manrope-OFL.txt`
- Modify: `package.json`
- Modify: `src/content/index.tsx`
- Modify: `src/content/styles/panel.css`
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`

**Interfaces:**
- Consumes: `src/assets/fonts/Manrope-Variable.woff2?inline`
- Produces: `MANROPE_FONT_FACE: string` and `withManropeFontFace(styles: string): string`

- [ ] **Step 1: Add the source/build verification script**

Create `scripts/verify-manrope.mjs`:

```js
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
requireText(sharedFont, /Manrope-Variable\.woff2\?inline/, 'inline Manrope WOFF2 import');
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
```

- [ ] **Step 2: Register and run the verifier to establish RED**

Add this script to `package.json`:

```json
"verify:font": "node scripts/verify-manrope.mjs"
```

Run:

```bash
npm run verify:font
```

Expected: FAIL because `src/assets/fonts/Manrope-Variable.woff2` does not exist.

- [ ] **Step 3: Acquire and copy the local font asset and license**

Run:

```bash
npm install --no-save --package-lock=false @fontsource-variable/manrope
mkdir -p src/assets/fonts THIRD_PARTY_LICENSES
cp node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2 src/assets/fonts/Manrope-Variable.woff2
cp node_modules/@fontsource-variable/manrope/LICENSE THIRD_PARTY_LICENSES/Manrope-OFL.txt
```

Expected: the repository contains the WOFF2 and the unmodified SIL Open Font License, while `package.json` and `package-lock.json` do not gain a Fontsource dependency.

- [ ] **Step 4: Add the shared font-face module**

Create `src/shared/manropeFont.ts`:

```ts
import manropeFontDataUrl from '../assets/fonts/Manrope-Variable.woff2?inline';

export const MANROPE_FONT_FACE = `
@font-face {
    font-family: 'Manrope';
    src: url('${manropeFontDataUrl}') format('woff2-variations');
    font-style: normal;
    font-weight: 200 800;
    font-display: swap;
}
`;

export function withManropeFontFace(styles: string): string {
    return `${MANROPE_FONT_FACE}\n${styles}`;
}
```

- [ ] **Step 5: Inject the font face into Shadow DOM and PiP styles**

In `src/content/index.tsx`, add:

```ts
import { withManropeFontFace } from '../shared/manropeFont';
```

After the CSS import, define:

```ts
const streamLyricsStyles = withManropeFontFace(panelStyles);
```

Use `streamLyricsStyles` for both injected style locations:

```ts
style.textContent = streamLyricsStyles;
```

```tsx
<App styles={streamLyricsStyles} initialVisible={initialVisible} />
```

- [ ] **Step 6: Inject the same font face into the options page**

At the start of `src/popup/popup.js`, add:

```js
import { MANROPE_FONT_FACE } from '../shared/manropeFont';

const fontStyle = document.createElement('style');
fontStyle.textContent = MANROPE_FONT_FACE;
document.head.appendChild(fontStyle);
```

- [ ] **Step 7: Put Manrope first in both interface font stacks**

Change the shared stack in `src/content/styles/panel.css` to:

```css
font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'Inter', sans-serif;
```

Change the body stack in `src/popup/popup.css` to:

```css
font-family: 'Manrope', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
```

- [ ] **Step 8: Build and verify GREEN**

Run:

```bash
npm run build
npm run verify:font
```

Expected: the build exits 0 and the verifier prints `Manrope source and build verification passed.`

- [ ] **Step 9: Commit the extension changes**

```bash
git add package.json scripts/verify-manrope.mjs src/assets/fonts/Manrope-Variable.woff2 src/shared/manropeFont.ts src/content/index.tsx src/content/styles/panel.css src/popup/popup.js src/popup/popup.css THIRD_PARTY_LICENSES/Manrope-OFL.txt
git commit -m "feat: bundle Manrope font"
```

### Task 2: Install Manrope for the current Linux user

**Files:**
- Create outside repository: `~/.local/share/fonts/Manrope/Manrope-Variable.woff2`

**Interfaces:**
- Consumes: `src/assets/fonts/Manrope-Variable.woff2`
- Produces: a Fontconfig-resolvable `Manrope` family for the current user

- [ ] **Step 1: Confirm the font is not currently resolved**

Run:

```bash
fc-match Manrope
```

Expected before installation: the output resolves to a fallback family rather than `Manrope`.

- [ ] **Step 2: Install the WOFF2 into the user font directory**

Run:

```bash
mkdir -p "$HOME/.local/share/fonts/Manrope"
install -m 0644 src/assets/fonts/Manrope-Variable.woff2 "$HOME/.local/share/fonts/Manrope/Manrope-Variable.woff2"
```

Expected: no `sudo` prompt and a readable WOFF2 file under the current user's font directory.

- [ ] **Step 3: Refresh and verify Fontconfig**

Run:

```bash
fc-cache -f "$HOME/.local/share/fonts"
fc-match Manrope
```

Expected: output begins with `Manrope-Variable.woff2: "Manrope"`.

- [ ] **Step 4: Run final repository verification**

Run:

```bash
npm run build
npm run verify:font
git status --short
```

Expected: both npm commands exit 0; status shows only unrelated pre-existing user changes, if any.
