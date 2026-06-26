# StreamLyrics

**Real-time synced lyrics — floating right on top of YouTube Music.**

StreamLyrics is a Chrome Extension that overlays a resizable, draggable lyrics panel directly on YouTube Music. It feels like a native part of the player — not a clunky popup.

---

## 🎬 Demo

[![Watch the demo](https://img.youtube.com/vi/fjx7rjMZ-7E/maxresdefault.jpg)](https://youtu.be/fjx7rjMZ-7E)

---

## ✨ Features

- 🎵 **Real-time synced lyrics** — Line-by-line lyrics synced to the millisecond using YouTube Music's internal timeline.
- 🎨 **Dominant color theming** — Extracts the dominant accent color from the album artwork (via ColorThief median-cut) and paints a dynamic glowing gradient behind the lyrics.
- 📐 **Three adaptive layout modes** — The panel morphs between three states based on how much space you give it:
  - **Full Mode** — Complete scrolling lyrics with visualizer, progress bar, and controls.
  - **Mini Card** — A compact square with the current lyric line, cover art, and quick controls. Activates when panel area ≤ 135,000 px².
  - **Ultra Capsule Pill** — A tiny floating horizontal strip with just the active lyric and play/pause. Activates when height ≤ 80px.
- 🔊 **Real-time audio visualizer** — A live 32-band FFT spectrum visualizer that reacts to the actual audio playing. Falls back to a procedural wave animation when audio access is unavailable.
- 🖱️ **Fully draggable & resizable** — Drag from anywhere on the panel, resize from any edge or corner with 8 precision handles.
- 💾 **Persisted layout memory** — Width, height, position, and mode are saved and restored exactly as you left them across sessions.
- ⏯️ **Full playback controls** — Play, pause, previous, next, 5-second skip forward/back — all inside the panel.
- 🎤 **Click any lyric to seek** — Tap any lyric line to jump the song to that exact timestamp.
- 🎼 **Instrumental detection** — Shows a music note icon during instrumental sections (intros and gaps) instead of leaving the panel blank.
- 🔁 **Hybrid lyrics source** — Pulls saved local lyrics first, then falls back to the [LRCLIB](https://lrclib.net) timestamped lyrics API for maximum coverage.
- 🛡️ **Error boundary** — A crash inside the panel falls back to a small retry message instead of leaving a blank shadow DOM.

---

## 📦 Installation

### Option A — Download a release

Download the ZIP for your system from the [latest release](https://github.com/Nowavelength/StreamLyrics-Extension/releases/latest), then follow the matching expandable guide.

<details>
<summary><strong>Windows download flow</strong></summary>

1. Download [`StreamLyrics-Windows.zip`](https://github.com/Nowavelength/StreamLyrics-Extension/releases/latest/download/StreamLyrics-Windows.zip).
2. Extract the ZIP somewhere permanent, for example `Documents\StreamLyrics`.
3. Open Chrome and go to `chrome://extensions/`.
4. Toggle **Developer mode** ON.
5. Click **Load unpacked**.
6. Select the extracted `StreamLyrics` folder.
7. Open [YouTube Music](https://music.youtube.com), play a song, and click the StreamLyrics toolbar icon.

</details>

<details>
<summary><strong>Linux download flow</strong></summary>

1. Download [`StreamLyrics-Linux.zip`](https://github.com/Nowavelength/StreamLyrics-Extension/releases/latest/download/StreamLyrics-Linux.zip).
2. Extract the ZIP somewhere permanent, for example `~/Applications/StreamLyrics`.
3. Open Chrome or Chromium and go to `chrome://extensions/`.
4. Toggle **Developer mode** ON.
5. Click **Load unpacked**.
6. Select the extracted `StreamLyrics` folder.
7. Optional for KDE Plasma users: install the KWin helper so StreamLyrics Document PiP stays above other windows:
   ```bash
   bash platform/linux/kwin/install.sh
   ```
   Run that from the folder created when you extracted the ZIP. Do not use `sudo`; the helper installs into your user config.
8. Open [YouTube Music](https://music.youtube.com), play a song, and click the StreamLyrics toolbar icon.

</details>

### Option B — Load from source

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

**5. You're done.** Open [YouTube Music](https://music.youtube.com), play any song, and click the StreamLyrics toolbar icon to show the panel.

---

### Option C — Development mode (with hot reload)

```bash
npm run dev
```

Vite watches for file changes and rebuilds automatically. After each rebuild, go to `chrome://extensions/` and click the **↺ refresh icon** on the StreamLyrics card to apply changes.

---

## 🎮 Usage

1. **Open YouTube or YouTube Music** and play any song.
2. **Click the StreamLyrics toolbar icon** to toggle the panel on. (If the tab was opened before installing the extension, the icon click will inject the script automatically — no manual reload needed.)
3. **Drag** the panel anywhere on screen by clicking and dragging from the background.
4. **Resize** by dragging any of the 8 edge or corner handles.
5. **Shrink it down** — drag the panel smaller to switch to Mini Card or Ultra Capsule Pill mode.
6. **Expand it back** — drag it larger or click the expand button to restore your previous full-mode size (it remembers).
7. **Click any lyric line** to seek the song to that exact moment.
8. **Use the playback controls** — play, pause, skip, all without leaving the panel.
9. **Open settings** — right-click the StreamLyrics toolbar icon and choose **Options**, or open `chrome://extensions/` and click "Extension options" on the StreamLyrics card.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 + TypeScript |
| Bundler | Vite + CRXJS |
| Styling | Vanilla CSS (Shadow DOM isolated, locally bundled Inter + Instrument Sans with system fallbacks) |
| Lyrics API | LRCLIB |
| Audio | Web Audio API (AnalyserNode FFT) |
| Color | ColorThief (median-cut quantization) |

---

## 📋 Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Send toggle messages to the currently focused YouTube/YouTube Music tab |
| `storage` | Save your panel size, position, settings, and any lyrics you download |
| `scripting` | Inject the content script on demand if it isn't already loaded (e.g. for tabs opened before install) |
| `host_permissions: youtube.com` | Inject the lyrics panel into YouTube |
| `host_permissions: music.youtube.com` | Inject the lyrics panel into YouTube Music |
| `host_permissions: lrclib.net` | Fetch synced lyrics from the LRCLIB API |

No analytics. No tracking. No third-party servers besides LRCLIB and YouTube's own image CDN for thumbnails.

---
