# StreamLyrics

A Chrome Extension that displays synchronized lyrics for YouTube videos, inspired by Spotify's lyrics view.

## Features

- 🎵 **Spotify-style lyrics panel** - Beautiful, synced lyrics on the right side
- 🎨 **Dynamic background colors** - Extracts colors from video thumbnails
- 🔄 **Hybrid lyrics fetching** - YouTube captions + Lrclib API fallback
- ⏯️ **Pause/resume sync** - Lyrics pause when video pauses
- 🖱️ **Click to seek** - Click any lyric line to jump to that timestamp
- 🎼 **Instrumental detection** - Shows music note during instrumental breaks

## Installation

1. Clone/download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" (top right toggle)
6. Click "Load unpacked" and select the `dist` folder

## Development

```bash
# Watch mode for development
npm run dev
```

## Usage

1. Open any YouTube video
2. The lyrics panel will appear on the right side
3. Click the music note icon in the player controls to toggle the panel
4. Click any lyric line to seek to that timestamp

## Tech Stack

- React 18 + TypeScript
- Vite + CRXJS
- Tailwind CSS
- Shadow DOM for style isolation

## License

MIT
