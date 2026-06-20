import manropeFontDataUrl from '../assets/fonts/Manrope-Variable.woff2';

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
