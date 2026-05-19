# StreamLyrics Extension Codebase Structure

This document outlines the directory structure, module responsibilities, and architecture of the StreamLyrics Chrome Extension after the UI and visualizer refactoring.

---

## 📂 Complete Directory Tree

```
lyrics extension/
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.json                # Extension Manifest (V3)
├── Setup_Extension.bat          # Script to quickly load/install extension
├── STRUCTURE.md                 # [THIS FILE] Codebase structure map
├── src/
│   ├── background/              # Extension Service Worker (handles lifecycle)
│   ├── popup/                   # Browser Action popup (if extension icon is clicked)
│   └── content/                 # Main Content Script injected into YouTube tabs
│       ├── App.tsx              # React Root orchestrating Pip mode & panel visibility
│       ├── index.tsx            # Main injection point (injects Shadow DOM, stylesheet, React App)
│       ├── components/          # UI Components
│       │   ├── LyricLine.tsx    # Single synced lyrics line item with scroll offsets
│       │   ├── ToggleButton.tsx # Floating activator icon to open the lyrics panel
│       │   ├── icons.tsx        # High-performance custom SVG icons (Play, Pause, Search, etc.)
│       │   ├── Panel.backup.tsx # Exact backup of previous emoji/header-control UI
│       │   └── Panel.tsx        # The main player panel, resizable/draggable panel with new player-dock
│       ├── hooks/               # Core Hook Utilities
│       │   ├── useAudioBars.ts  # Web Audio API hook parsing FFT waves to center-mirrored heights
│       │   ├── useDominantColor.ts # Extract average video frames to style the glass panel
│       │   ├── useSettings.ts   # Persisted workspace customization (font size, styles)
│       │   ├── useTranscript.ts # Core sync fetching flow (Waterfall strategies, multi-pass search)
│       │   └── useVideoSync.ts  # Hooks time sync of lyric lines directly to the video element
│       ├── services/            # API & Persistence Services
│       │   ├── lrclibService.ts # Searches & deduplicates timing metadata from LRCLIB
│       │   ├── storageService.ts# Local persistence/retrieval engine for offsets and custom queries
│       │   └── transcriptService.ts # Core coordinator routing data between Youtube, Local, and APIs
│       └── utils/
│           └── transcriptParser.ts # Text cleaners parsing messy video titles to clean song metadata
```

---

## 🔌 Modules & Responsibilities

### 1. UI Components (`src/content/components/`)
*   **`Panel.tsx`**: Core player interface. Incorporates drag-and-drop headers, manual query input panels, and the new **`player-dock`** (housing the live center-symmetrical audio visualizer and perfectly centered SVG playback control group).
*   **`icons.tsx`**: Drop-in high-fidelity functional vector SVG components (`PlayIcon`, `PauseIcon`, `SearchIcon`, etc.) replacing all older unicode emojis.
*   **`LyricLine.tsx`**: Individual line renderer; highlights the active line and darkens past lines, allowing click-to-skip integration.

### 2. Audio Processing (`src/content/hooks/useAudioBars.ts`)
*   Extracts live frequency bands using the browser's hardware **`AudioContext`** and **`AnalyserNode`**.
*   Implements **mirrored FFT mapping** so bass resides in the center, and treble maps to the outer edges.
*   Incorporates **visual inertia** (`prev * 0.8 + next * 0.2`) to eliminate jitter.
*   Performs a realistic **procedural wave simulation** if browser CORS restrictions block direct tab capture.

### 3. Audio / Video Synchronization (`src/content/hooks/useVideoSync.ts`)
*   Ties React timing ticks precisely to YouTube's `<video>.currentTime` hook.
*   Coordinates playback states (`isPaused`), forwards, rewinds, and lyric line indexing.

### 4. Fetching & Deduplication (`src/content/hooks/useTranscript.ts` & services)
*   **`lrclibService.ts`**: Implements a multi-pass plan generating multiple search permutations (e.g. detected title, youtube channel, clean video title) to aggressively locate synced lyrics. Deduplicates matches structurally so only unique versions show up in the toggle loop.
*   **`storageService.ts`**: Dictates the "Save" lifecycle. Ensures absolutely no lyrics auto-save, giving the user manual control over what stays in `localStorage`.

---

## 🌊 Reactive Visualizer Flow

```
YouTube Video Frame Audios
          │
          ▼
   AudioContext API (useAudioBars)
          │
          ▼
   AnalyserNode (Transforms waveform via Fast Fourier Transform)
          │
          ▼
   Logarithmic/Mirrored Bin Mapping (Organizes bass to middle, treble to outer edges)
          │
          ▼
   Smoothing Easing (prev * 0.8 + new * 0.2)
          │
          ▼
   React Height States (Renders as height values inline on viz-bar span)
          │
          ▼
   CSS Centering (align-items: center in index.tsx vertically centers the bars so they expand outward)
```
