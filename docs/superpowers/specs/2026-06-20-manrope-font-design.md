# Manrope Font Design

## Goal

Give StreamLyrics a Spotify-like typographic feel without using Spotify's
proprietary Circular font or loading fonts from a third-party CDN.

## Design

- Bundle the open-source Manrope variable font as a local WOFF2 extension
  asset, including its license notice.
- Define one `@font-face` family named `Manrope` with the available variable
  weight range and `font-display: swap`.
- Make Manrope the first family in the shared Shadow DOM font stack so full,
  mini, ultra, and Document PiP modes render consistently.
- Apply the same family to the options page for a unified interface.
- Keep the existing system font stack after Manrope as a resilient fallback.
- Do not add a remote font request, Google Fonts stylesheet, or host
  permission.

## Packaging

The font files will live under a dedicated extension asset directory and be
referenced from CSS in a form that Vite/CRXJS includes in the production
bundle. The production build must contain the generated font asset.

## Local System Installation

Install Manrope for the current Linux user, not globally, so no administrator
password is stored or passed non-interactively. Refresh the font cache and
verify that Fontconfig can resolve the `Manrope` family.

## Verification

- Run the production build and require a zero exit status.
- Confirm the built output contains a Manrope WOFF2 asset.
- Confirm both panel and popup styles select Manrope first.
- Confirm Fontconfig resolves Manrope after the optional local installation.

## Non-goals

- Obtaining, bundling, or imitating the proprietary Circular font files.
- Changing font sizes, lyric spacing, mode thresholds, or layout behavior.
- Loading any runtime font resource from the network.
