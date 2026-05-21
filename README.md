# StreamLyrics

**Real-time synced lyrics — floating right on top of YouTube Music.**

StreamLyrics is a premium Chrome Extension that overlays a resizable, draggable lyrics panel directly on YouTube Music. It feels like a native part of the player — not a clunky popup.

---

## ✨ Features

- 🎵 **Real-time synced lyrics** — Line-by-line lyrics synced to the millisecond using YouTube Music's internal timeline.
- 🎨 **Dominant color theming** — Extracts the dominant accent color from the album artwork and paints a dynamic glowing gradient behind the lyrics.
- 📐 **Three adaptive layout modes** — The panel morphs between three states based on how much space you give it:
  - **Full Mode** — Complete scrolling lyrics with visualizer, progress bar, and controls.
  - **Mini Card** — A compact square with the current lyric line, cover art, and quick controls. Activates when panel area ≤ 135,000 px².
  - **Ultra Capsule Pill** — A tiny floating horizontal strip with just the active lyric and play/pause. Activates when height ≤ 80px.
- 🔊 **Real-time audio visualizer** — A live 32-band FFT spectrum visualizer that reacts to the actual audio playing. Falls back to a procedural wave animation when audio access is unavailable.
- 🖱️ **Fully draggable & resizable** — Drag from anywhere on the panel, resize from any edge or corner with 8 precision handles.
- 💾 **Persisted layout memory** — Size, position, and mode are saved and restored exactly as you left them across sessions.
- ⏯️ **Full playback controls** — Play, pause, previous, next, 5-second skip forward/back, and a seek scrubber — all inside the panel.
- 🎤 **Click any lyric to seek** — Tap any lyric line to jump the song to that exact timestamp.
- 🎼 **Instrumental detection** — Shows a music note icon during instrumental sections instead of leaving the panel blank.
- 🔁 **Hybrid lyrics source** — Pulls lyrics from YouTube Music's own captions first, then falls back to the [LRCLIB](https://lrclib.net) timestamped lyrics API for maximum coverage.

---

## 📦 Installation

### Option A — Load from source (Recommended)

**Requirements:** Node.js 18+, npm

**1. Clone the repository:**
```bash
git clone https://github.com/Nowavelength/StreamLyrics-Extension.git
cd StreamLyrics-Extension
```

**2. Install dependencies:**
```bash
npm install
```

**3. Build the extension:**
```bash
npm run build
```
This compiles everything into the `dist/` folder.

**4. Load it into Chrome:**
- Open Chrome and navigate to `chrome://extensions/`
- Toggle **Developer mode** ON (top-right corner)
- Click **Load unpacked**
- Select the `dist/` folder inside this repo

**5. You're done.** Open [YouTube Music](https://music.youtube.com), play any song, and the StreamLyrics panel appears automatically.

---

### Option B — Development mode (with hot reload)

```bash
npm run dev
```

Vite watches for file changes and rebuilds automatically. After each rebuild, go to `chrome://extensions/` and click the **↺ refresh icon** on the StreamLyrics card to apply changes.

---

## 🎮 Usage

1. **Open YouTube Music** and play any song — the panel appears automatically.
2. **Drag** the panel anywhere on screen by clicking and dragging from the background.
3. **Resize** by dragging any of the 8 edge or corner handles.
4. **Shrink it down** — drag the panel smaller to switch to Mini Card or Ultra Capsule Pill mode.
5. **Expand it back** — drag it larger or click the expand button in pill/mini mode to restore full mode.
6. **Click any lyric line** to seek the song to that exact moment.
7. **Use the playback controls** — play, pause, skip, and scrub without leaving the panel.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 + TypeScript |
| Bundler | Vite + CRXJS |
| Styling | Vanilla CSS (Shadow DOM isolated) |
| Lyrics API | LRCLIB + YouTube captions |
| Audio | Web Audio API (AnalyserNode FFT) |

---

## 📋 Permissions

| Permission | Why it's needed |
|---|---|
| `tabs` | Read the active YouTube Music tab URL |
| `storage` | Save your panel size, position, and settings |
| `host_permissions (music.youtube.com)` | Inject the lyrics panel into YouTube Music pages |

---

## 📄 License

MIT — use it, fork it, build on it.
