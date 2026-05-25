import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import panelStyles from './styles/panel.css?inline';

/**
 * StreamLyrics Content Script Entry Point
 * Injects React app into YouTube pages using Shadow DOM for style isolation
 */

const CONTAINER_ID = 'streamlyrics-root';

// Track if the extension has been activated in this session
let hasBeenActivated = false;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_PANEL') {
    if (!hasBeenActivated) {
      console.log('[StreamLyrics] Activation signal received');
      hasBeenActivated = true;
      init(true); // Initialize and show immediately
    }
    // If already activated, the App component handles the toggle via its own listener
  }
});

function init(initialVisible = false) {
  // Don't re-inject if already present
  if (document.getElementById(CONTAINER_ID)) {
    console.log('[StreamLyrics] Already injected, skipping...');
    return;
  }

  console.log('[StreamLyrics] Initializing...');

  // Wait for YouTube/YouTube Music player to be ready
  const waitForPlayer = () => {
    // Check for YouTube or YouTube Music player
    const player = document.querySelector('#movie_player') ||
      document.querySelector('ytmusic-player') ||
      document.querySelector('#player') ||
      document.querySelector('video');

    if (!player) {
      console.log('[StreamLyrics] Waiting for player...');
      setTimeout(waitForPlayer, 500);
      return;
    }

    console.log('[StreamLyrics] Player found, injecting app...');
    injectApp(initialVisible);
  };

  waitForPlayer();
}

function injectApp(initialVisible: boolean) {
  // Create host element
  const host = document.createElement('div');
  host.id = CONTAINER_ID;
  document.body.appendChild(host);

  // Create Shadow DOM for style isolation
  const shadow = host.attachShadow({ mode: 'open' });

  // Combine local styles and compiled Tailwind styles
  const allStyles = panelStyles + '\n' + getStyles();

  // Create style element with our CSS
  const style = document.createElement('style');
  style.textContent = allStyles;
  shadow.appendChild(style);

  // Add Google Fonts link
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&display=swap';
  shadow.appendChild(fontLink);

  // Create React mount point
  const mountPoint = document.createElement('div');
  mountPoint.id = 'streamlyrics-mount';
  shadow.appendChild(mountPoint);

  // Mount React app
  const root = createRoot(mountPoint);
  // Pass styles to App so it can inject into PIP window
  root.render(<App styles={allStyles} initialVisible={initialVisible} />);

  console.log('[StreamLyrics] Injected successfully!');
}

/**
 * Inline styles for Shadow DOM
 */
function getStyles(): string {
  return `
    /* StreamLyrics Panel Styles - PIP Mode */
    .streamlyrics-panel {
      position: fixed;
      z-index: 9999;
      overflow: hidden;
      font-family: 'Figtree', 'Inter', sans-serif;
      transition: opacity 0.3s ease-out, box-shadow 0.2s;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.1);
    }

    .streamlyrics-panel.pip-mode {
      /* Styles applied via inline style */
    }

    .streamlyrics-panel.hidden {
      opacity: 0;
      pointer-events: none;
      transform: scale(0.95);
    }

    .streamlyrics-panel.interacting {
      user-select: none;
      box-shadow: 0 12px 48px rgba(0,0,0,0.6);
      transition: none !important; /* Lock resizing frame to mouse speed */
    }

    /* Drag Handle Bar */
    .drag-handle {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      z-index: 5;
    }

    .drag-handle:active {
      cursor: grabbing;
    }

    .drag-indicator {
      color: rgba(255,255,255,0.4);
      font-size: 10px;
      letter-spacing: 2px;
    }

    /* Resize Handles - Edges */
    .resize-handle {
      position: absolute;
      z-index: 10000;
    }

    .resize-handle.resize-n {
      top: 0; left: 16px; right: 16px; height: 10px;
      cursor: ns-resize;
    }
    .resize-handle.resize-s {
      bottom: 0; left: 16px; right: 16px; height: 10px;
      cursor: ns-resize;
    }
    .resize-handle.resize-e {
      right: 0; top: 16px; bottom: 16px; width: 10px;
      cursor: ew-resize;
    }
    .resize-handle.resize-w {
      left: 0; top: 16px; bottom: 16px; width: 10px;
      cursor: ew-resize;
    }

    /* Resize Handles - Corners */
    .resize-handle.resize-nw {
      top: 0; left: 0; width: 16px; height: 16px;
      cursor: nwse-resize;
    }
    .resize-handle.resize-ne {
      top: 0; right: 0; width: 16px; height: 16px;
      cursor: nesw-resize;
    }
    .resize-handle.resize-sw {
      bottom: 0; left: 0; width: 16px; height: 16px;
      cursor: nesw-resize;
    }
    .resize-handle.resize-se {
      bottom: 0; right: 0; width: 16px; height: 16px;
      cursor: nwse-resize;
    }

    .resize-handle:hover {
      background: rgba(255,255,255,0.15);
    }

    .streamlyrics-scroll-container {
      height: calc(100% - 220px);
      margin-top: 90px;
      overflow-y: auto;
      padding: 20px 24px 80px 24px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .streamlyrics-scroll-container::-webkit-scrollbar {
      display: none;
    }

    /* Source Header */
    .source-header {
      position: absolute;
      top: 24px;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 100%);
      z-index: 5;
    }

    .in-pip-window .source-header {
      top: 0;
    }

    .source-label {
      font-size: 11px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 600;
    }

    .source-buttons {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .source-name {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 4px 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.2);
    }

    .source-btn {
      font-size: 10px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .source-btn:hover:not(.disabled) {
      background: rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.8);
    }

    .source-btn.active {
      background: rgba(255,255,255,0.25);
      color: #fff;
      border-color: rgba(255,255,255,0.4);
    }

    .source-btn.disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .source-btn.pip-btn {
      background: rgba(100,200,255,0.15);
      border-color: rgba(100,200,255,0.3);
    }

    .source-btn.pip-btn:hover {
      background: rgba(100,200,255,0.25);
      border-color: rgba(100,200,255,0.5);
    }

    /* Offset Controls */
    .offset-controls {
      position: absolute;
      top: 60px;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 6px 12px;
      z-index: 5;
    }
    .in-pip-window .offset-controls {
      top: 40px;
    }

    /* Next-line preview rides 30px below the offset row on both layouts */
    .in-pip-window .next-line-preview {
      top: 70px;
    }

    /* Scroll Container Adjustments for PIP */
    .in-pip-window .streamlyrics-scroll-container {
      margin-top: 80px;
      height: calc(100% - 210px);
    }

    .in-pip-window {
      border-radius: 0 !important;
      box-shadow: none !important;
      border: none !important;
    }

    .offset-btn {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.7);
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .offset-btn:hover {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }

    .offset-value {
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 4px;
      padding: 4px 12px;
      cursor: ew-resize;
      min-width: 78px;
      text-align: center;
      font-family: inherit;
      user-select: none;
      transition: background 0.15s, border-color 0.15s;
      font-variant-numeric: tabular-nums;
    }

    .offset-value:hover {
      background: rgba(255,255,255,0.25);
      border-color: rgba(255,255,255,0.4);
    }

    .offset-controls.adjusting .offset-value {
      background: rgba(255,255,255,0.32);
      border-color: rgba(255,255,255,0.55);
      box-shadow: 0 0 12px rgba(255,255,255,0.18);
    }

    /* Direction hint — fades in below the offset row only while user is
       actively tuning. Tells you what +/- means in plain English so the
       sign convention is unambiguous at the moment it matters. */
    .offset-hint {
      position: absolute;
      bottom: -16px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.75);
      white-space: nowrap;
      letter-spacing: 0.3px;
      opacity: 0;
      transition: opacity 0.18s ease-out;
      pointer-events: none;
      text-shadow: 0 1px 4px rgba(0,0,0,0.5);
    }

    .offset-controls.adjusting .offset-hint {
      opacity: 1;
    }

    /* Next-line preview — overlays the top of the lyric scroll area with a
       small countdown to the upcoming line. Soft gradient backdrop so it
       reads against any dominant-colour background. */
    .next-line-preview {
      position: absolute;
      top: 90px;
      left: 24px;
      right: 24px;
      z-index: 6;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px 16px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.18) 60%, transparent 100%);
      color: rgba(255,255,255,0.78);
      font-size: 11px;
      font-weight: 600;
      pointer-events: none;
      animation: next-line-fade 0.25s ease-out;
    }

    .next-line-countdown {
      color: #ffffff;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      letter-spacing: 0.3px;
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    }

    .next-line-text {
      font-style: italic;
      opacity: 0.85;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }

    @keyframes next-line-fade {
      from { opacity: 0; transform: translateY(-2px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* "You are here" marker — vertical accent positioned at the raw audio
       time within the lyric flow. Stays muted normally; glows when the user
       is actively tuning so the gap between this and the highlighted line
       (which uses offset-adjusted time) is unmistakable. */
    .streamlyrics-scroll-container {
      position: relative;
    }

    .audio-position-marker {
      position: absolute;
      left: 4px;
      width: 3px;
      height: 22px;
      transform: translateY(-50%);
      background: linear-gradient(
        to bottom,
        transparent 0%,
        rgba(255, 255, 255, 0.95) 50%,
        transparent 100%
      );
      border-radius: 3px;
      pointer-events: none;
      opacity: 0.35;
      transition: top 0.12s linear, opacity 0.25s ease-out;
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
      z-index: 1;
    }

    .streamlyrics-scroll-container.adjusting .audio-position-marker {
      opacity: 1;
      box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
    }

    /* Lyric Line Base Styles */
    .lyric-line {
      font-family: 'Figtree', sans-serif;
      font-weight: 800;
      font-size: 32px;
      line-height: 1.5;
      text-align: left;
      margin-bottom: 16px;
      transition: color 0.3s ease-out, opacity 0.3s ease-out, transform 0.2s ease-out, text-decoration 0.2s ease-out;
      cursor: pointer;
      text-decoration: none;
    }

    .lyric-line:hover {
      transform: scale(1.02);
      text-decoration: underline;
      text-underline-offset: 4px;
    }

    /* Past & Active Lines - White */
    .lyric-past,
    .lyric-active {
      color: #FFFFFF;
      opacity: 1;
    }

    .lyric-active {
      transform: scale(1.05);
      /* Karaoke-style left-to-right fill driven by --progress (0-1) on the
         wrapper div. The unfilled portion stays at 55% opacity so the line
         is still readable; filled portion is solid white. */
      background: linear-gradient(
        90deg,
        #ffffff calc(var(--progress, 0) * 100%),
        rgba(255, 255, 255, 0.55) calc(var(--progress, 0) * 100%)
      );
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      transition: background 0.08s linear, transform 0.2s ease-out;
    }

    /* Disable the gradient transition while user is actively tuning offset
       so the karaoke fill snaps to the new position instantly */
    .streamlyrics-scroll-container.adjusting .lyric-active {
      transition: transform 0.2s ease-out;
    }

    /* Future Lines - Black with reduced opacity */
    .lyric-future {
      color: #000000;
      opacity: 0.6;
    }

    /* Instrumental Indicator */
    .instrumental-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #FFFFFF;
      opacity: 0.8;
    }

    .music-note {
      font-size: 48px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 0.6;
      }
      50% {
        transform: scale(1.2);
        opacity: 1;
      }
    }

    /* Loading State */
    .lyrics-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #FFFFFF;
      text-align: center;
      padding: 32px;
      background:
        radial-gradient(circle at center, rgba(255,255,255,0.16), transparent 34%),
        linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.18));
    }

    .loading-visual {
      position: relative;
      width: 92px;
      height: 92px;
      margin-bottom: 20px;
    }

    .loading-ring,
    .loading-dot {
      position: absolute;
      inset: 0;
      margin: auto;
      border-radius: 50%;
    }

    .loading-ring {
      border: 1px solid rgba(255,255,255,0.28);
      animation: lyrics-pulse-ring 1.8s ease-in-out infinite;
    }

    .loading-ring-two {
      inset: 16px;
      animation-delay: 0.35s;
    }

    .loading-dot {
      width: 18px;
      height: 18px;
      background: #fff;
      box-shadow: 0 0 28px rgba(255,255,255,0.65);
      animation: lyrics-float-dot 1.4s ease-in-out infinite;
    }

    .loading-text {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0;
      margin-bottom: 8px;
    }

    .loading-subtext {
      max-width: 260px;
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .loading-bars {
      display: flex;
      align-items: end;
      gap: 5px;
      height: 26px;
      margin-top: 22px;
    }

    .loading-bars span {
      width: 5px;
      height: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.78);
      animation: lyrics-bars 0.9s ease-in-out infinite;
    }

    .loading-bars span:nth-child(2) {
      animation-delay: 0.12s;
    }

    .loading-bars span:nth-child(3) {
      animation-delay: 0.24s;
    }

    .loading-bars span:nth-child(4) {
      animation-delay: 0.36s;
    }

    @keyframes lyrics-pulse-ring {
      0%, 100% {
        opacity: 0.35;
        transform: scale(0.78);
      }
      50% {
        opacity: 0.9;
        transform: scale(1);
      }
    }

    @keyframes lyrics-float-dot {
      0%, 100% {
        transform: translateY(5px) scale(0.9);
      }
      50% {
        transform: translateY(-5px) scale(1);
      }
    }

    @keyframes lyrics-bars {
      0%, 100% {
        height: 8px;
        opacity: 0.55;
      }
      50% {
        height: 26px;
        opacity: 1;
      }
    }

    /* No Lyrics State */
    .no-lyrics {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #FFFFFF;
      text-align: center;
      padding: 32px;
      background: linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.2));
    }

    .no-lyrics-icon {
      width: 72px;
      height: 72px;
      margin-bottom: 16px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.24);
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .no-lyrics-icon::before {
      content: "\\266A";
      font-size: 34px;
      font-weight: 800;
    }

    .no-lyrics-text {
      font-size: 18px;
      font-weight: 600;
      line-height: 1.35;
      max-width: 270px;
    }

    .retry-btn {
      margin-top: 18px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 6px;
      padding: 8px 14px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 800;
    }

    .retry-btn:hover {
      background: rgba(255,255,255,0.22);
    }

    .manual-search {
      width: min(280px, 100%);
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .manual-search input {
      width: 100%;
      color: rgba(255,255,255,0.95);
      background: rgba(0,0,0,0.18);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px;
      padding: 9px 10px;
      outline: none;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
    }

    .manual-search input::placeholder {
      color: rgba(255,255,255,0.52);
    }

    .manual-search input:focus {
      border-color: rgba(255,255,255,0.4);
      background: rgba(0,0,0,0.25);
    }

    .manual-search button {
      color: rgba(0,0,0,0.82);
      background: rgba(255,255,255,0.86);
      border: 0;
      border-radius: 6px;
      padding: 9px 12px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 900;
    }

    .manual-search button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    /* Bottom Player Dock */
    .player-dock {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: column;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 70%, transparent 100%);
      padding: 24px 16px 16px 16px;
      z-index: 5;
    }

    /* Full Player Metadata Cockpit Styles */
    .metadata-cockpit {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      padding: 0 4px;
    }

    .metadata-cockpit .thumbnail-container {
      width: 48px;
      height: 48px;
      border-radius: 6px;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.15);
    }

    .metadata-cockpit .thumbnail-container img,
    .metadata-cockpit .album-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .metadata-cockpit .track-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-align: left;
    }

    .metadata-cockpit .track-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff !important;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 2px 4px rgba(0,0,0,0.4);
      font-family: inherit;
    }

    .metadata-cockpit .track-artist {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.65) !important;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 2px 4px rgba(0,0,0,0.4);
      font-family: inherit;
    }

    /* Visualizer (Waveform) */
    .visualizer {
      display: flex;
      align-items: center; /* Makes bars expand symmetrically up and down */
      justify-content: center;
      gap: 4px;
      height: 32px;
      margin-bottom: 12px;
    }

    .viz-bar {
      width: 4px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.82);
      will-change: height;
    }

    /* Player Controls */
    .player-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }

    .player-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      line-height: 0;
      box-sizing: border-box;
      flex: 0 0 auto;
      transition: transform 0.18s ease, color 0.18s ease, opacity 0.18s ease;
    }

    .player-btn svg {
      display: block;
    }

    .player-btn:hover {
      color: #fff;
      transform: scale(1.08);
    }

    .player-btn-play {
      width: 52px;
      height: 52px;
      border-radius: 999px;
      background: #fff;
      color: #111;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    }

    .player-btn-play:hover {
      color: #111;
      transform: scale(1.04);
      background: #f4f4f4;
    }

    /* Responsive Mini & Ultra Player Modes CSS rules */

    /* Prevent native dragging and text selections from hijacking custom panel movement */
    .spotify-header,
    .spotify-body,
    .spotify-footer,
    .spotify-pill-content {
      user-select: none !important;
      -webkit-user-drag: none !important;
    }

    .mode-mini.streamlyrics-panel {
      background-color: #121212 !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 14px !important;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6) !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      padding: 0 !important;
    }

    .spotify-header {
      width: 100%;
      height: 26px;
      display: flex;
      align-items: center;
      padding: 0 10px;
      background: #181818;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      position: relative;
      user-select: none;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .spotify-close-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #ff5f56;
      border: none;
      cursor: pointer;
      padding: 0;
      transition: transform 0.15s ease, opacity 0.15s ease;
      z-index: 10;
    }

    .spotify-close-dot:hover {
      transform: scale(1.1);
      opacity: 0.8;
    }

    .spotify-grip-center {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      color: rgba(255, 255, 255, 0.35);
    }

    .spotify-body {
      flex: 1;
      width: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #121212;
      box-sizing: border-box;
    }

    .spotify-ambient-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      opacity: 0.35;
      pointer-events: none;
      z-index: 1;
    }

    .spotify-artwork-card {
      width: 65%;
      aspect-ratio: 1 / 1;
      max-width: 180px;
      max-height: 180px;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      z-index: 2;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    .spotify-album-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      user-select: none;
      -webkit-user-drag: none;
    }

    /* Spotify Hover Controls Overlay */
    .spotify-hover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease-in-out;
    }

    .spotify-artwork-card:hover .spotify-hover-overlay {
      opacity: 1;
      pointer-events: auto;
    }

    .spotify-artwork-card:hover {
      transform: scale(1.02);
    }

    .spotify-controls-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .spotify-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      padding: 0;
      line-height: 0;
      box-sizing: border-box;
      transition: transform 0.15s ease, color 0.15s ease;
    }

    .spotify-btn:hover {
      color: #fff;
      transform: scale(1.1);
    }

    .spotify-btn.play-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #ffffff;
      color: #000000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    .spotify-btn.play-btn:hover {
      background: #f0f0f0;
      color: #000000;
      transform: scale(1.06);
    }

    .spotify-footer {
      width: 100%;
      height: 52px;
      background: #121212;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      flex-shrink: 0;
      user-select: none;
      box-sizing: border-box;
    }

    .spotify-track-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
      text-align: left;
    }

    .spotify-track-artist {
      font-size: 11px;
      color: #b3b3b3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
    }



    .mode-ultra.streamlyrics-panel {
      background-color: #121212 !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 999px !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5) !important;
      overflow: hidden !important;
      display: flex !important;
      align-items: center !important;
      padding: 0 !important;
    }

    .spotify-pill-content {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      padding: 0 12px;
      box-sizing: border-box;
      user-select: none;
    }

    .spotify-pill-left {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .spotify-pill-grip {
      display: flex;
      align-items: center;
      color: rgba(255, 255, 255, 0.25);
    }

    .spotify-pill-artwork {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      overflow: hidden;
      margin-left: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
    }

    .spotify-pill-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .spotify-pill-info {
      flex: 1;
      min-width: 0;
      margin-left: 8px;
      margin-right: 8px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: left;
    }

    .spotify-pill-title {
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
      text-align: left;
    }

    .spotify-pill-artist {
      font-size: 9px;
      color: #b3b3b3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
      margin-top: 1px;
      text-align: left;
    }

    .spotify-pill-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .spotify-pill-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      padding: 0;
      line-height: 0;
      transition: transform 0.15s ease, color 0.15s ease;
    }

    .spotify-pill-btn:hover {
      color: #fff;
      transform: scale(1.1);
    }

    .spotify-pill-btn.play-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #ffffff;
      color: #000000;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    .spotify-pill-btn.play-btn:hover {
      background: #f0f0f0;
      color: #000000;
      transform: scale(1.06);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
}



// NOTE: We don't call init() on load anymore to support click-to-activate.
// Instead we wait for the message in the listener above.

// Handle YouTube SPA navigation
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;

    // Keep the existing React instance alive on YouTube SPA navigation.
    // Re-mounting here orphans document-PiP windows and makes the in-page
    // panel appear again while the popout goes black.
    if (hasBeenActivated && !document.getElementById(CONTAINER_ID)) {
      setTimeout(() => init(true), 500);
    }
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });
