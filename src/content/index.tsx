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
      z-index: 10;
    }

    .resize-handle.resize-n {
      top: 0; left: 10px; right: 10px; height: 6px;
      cursor: ns-resize;
    }
    .resize-handle.resize-s {
      bottom: 0; left: 10px; right: 10px; height: 6px;
      cursor: ns-resize;
    }
    .resize-handle.resize-e {
      right: 0; top: 10px; bottom: 10px; width: 6px;
      cursor: ew-resize;
    }
    .resize-handle.resize-w {
      left: 0; top: 10px; bottom: 10px; width: 6px;
      cursor: ew-resize;
    }

    /* Resize Handles - Corners */
    .resize-handle.resize-nw {
      top: 0; left: 0; width: 12px; height: 12px;
      cursor: nwse-resize;
    }
    .resize-handle.resize-ne {
      top: 0; right: 0; width: 12px; height: 12px;
      cursor: nesw-resize;
    }
    .resize-handle.resize-sw {
      bottom: 0; left: 0; width: 12px; height: 12px;
      cursor: nesw-resize;
    }
    .resize-handle.resize-se {
      bottom: 0; right: 0; width: 12px; height: 12px;
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
      cursor: pointer;
      min-width: 60px;
      text-align: center;
      font-family: inherit;
    }

    .offset-value:hover {
      background: rgba(255,255,255,0.25);
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

    /* Hide resize handles in compact player modes since they snap to fixed shapes */
    .mode-mini .resize-handle,
    .mode-ultra .resize-handle {
      display: none !important;
      pointer-events: none !important;
    }

    /* Lock in-page panel to strict, visually justified compact shapes to prevent large grey containers */
    .pip-style.mode-mini {
      width: 280px !important;
      height: 320px !important;
      min-width: 280px !important;
      max-width: 280px !important;
      min-height: 320px !important;
      max-height: 320px !important;
    }

    .pip-style.mode-ultra {
      width: 200px !important;
      height: 220px !important;
      min-width: 200px !important;
      max-width: 200px !important;
      min-height: 220px !important;
      max-height: 220px !important;
    }

    /* Horizontal compact layout strict bounds */
    .pip-style.layout-horizontal {
      width: 280px !important;
      height: 110px !important;
      min-width: 280px !important;
      max-width: 280px !important;
      min-height: 110px !important;
      max-height: 110px !important;
    }

    /* Prevent native dragging and text selections from hijacking custom panel movement */
    .metadata-cockpit,
    .player-dock {
      user-select: none !important;
      -webkit-user-drag: none !important;
    }
    
    /* Collapsing lyrics, offsets, search, source header, and drag handle in compact modes */
    .mode-mini .streamlyrics-scroll-container,
    .mode-ultra .streamlyrics-scroll-container,
    .mode-mini .offset-controls,
    .mode-ultra .offset-controls,
    .mode-mini .source-header,
    .mode-ultra .source-header,
    .mode-mini .drag-handle,
    .mode-ultra .drag-handle {
      height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
      border: none !important;
    }

    /* Seamless flex layouts for the compact player dashboards */
    .mode-mini.streamlyrics-panel,
    .mode-ultra.streamlyrics-panel {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.4s ease;
    }

    .mode-mini .player-dock,
    .mode-ultra .player-dock {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: transparent;
      padding: 16px;
      box-sizing: border-box;
    }

    /* Full Mode Hide metadata-cockpit and expand btn */
    .mode-full .metadata-cockpit {
      display: none !important;
    }
    .mode-full .player-btn-expand {
      display: none !important;
    }

    /* MINI PLAYER MODE */
    .mode-mini .visualizer {
      display: none !important;
    }
    .mode-mini .player-btn-expand {
      display: none !important;
    }
    .mode-mini .metadata-cockpit {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 16px;
      width: 100%;
      animation: fadeIn 0.3s ease;
    }
    .mode-mini .thumbnail-container {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      margin-bottom: 12px;
      background: rgba(255,255,255,0.05);
      transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    .mode-mini .thumbnail-container:hover {
      transform: scale(1.04);
    }
    .mode-mini .album-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .mode-mini .track-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      padding: 0 12px;
      box-sizing: border-box;
    }
    .mode-mini .track-title {
      font-size: 15px;
      font-weight: 800;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mode-mini .track-artist {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mode-mini .player-controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    /* ULTRA COMPACT PLAYER MODE */
    .mode-ultra .visualizer {
      display: none !important;
    }
    /* Hide Next, Prev, Rewind, and Forward buttons in ultra mode */
    .mode-ultra .player-btn-prev,
    .mode-ultra .player-btn-rewind,
    .mode-ultra .player-btn-forward,
    .mode-ultra .player-btn-next {
      display: none !important;
    }
    .mode-ultra .metadata-cockpit {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 12px;
      width: 100%;
      animation: fadeIn 0.3s ease;
    }
    .mode-ultra .thumbnail-container {
      width: 56px;
      height: 56px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 6px 18px rgba(0,0,0,0.45);
      margin-bottom: 8px;
      background: rgba(255,255,255,0.05);
      transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    .mode-ultra .thumbnail-container:hover {
      transform: scale(1.04);
    }
    .mode-ultra .album-art {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .mode-ultra .track-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      padding: 0 16px;
      box-sizing: border-box;
    }
    .mode-ultra .track-title {
      font-size: 13px;
      font-weight: 800;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mode-ultra .track-artist {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mode-ultra .player-controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 14px;
      width: 100%;
    }
    .mode-ultra .player-btn-play {
      width: 40px;
      height: 40px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .mode-ultra .player-btn-expand {
      display: grid !important;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      transition: all 0.2s ease;
    }
    .mode-ultra .player-btn-expand:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      transform: scale(1.08);
    }

    /* Horizontal Layout for Low Heights */
    .streamlyrics-panel.layout-horizontal .player-dock {
      flex-direction: row !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 10px 14px !important;
      gap: 12px !important;
      height: 100% !important;
      box-sizing: border-box !important;
    }

    .streamlyrics-panel.layout-horizontal .metadata-cockpit {
      flex-direction: row !important;
      align-items: center !important;
      text-align: left !important;
      margin-bottom: 0 !important;
      flex: 1 !important;
      min-width: 0 !important;
      gap: 10px !important;
    }

    .streamlyrics-panel.layout-horizontal .thumbnail-container {
      width: 40px !important;
      height: 40px !important;
      margin-bottom: 0 !important;
      border-radius: 6px !important;
      flex-shrink: 0 !important;
    }

    .streamlyrics-panel.layout-horizontal .track-info {
      text-align: left !important;
      padding: 0 !important;
      min-width: 0 !important;
    }

    .streamlyrics-panel.layout-horizontal .track-title {
      font-size: 13px !important;
      font-weight: 800 !important;
      margin-bottom: 2px !important;
    }

    .streamlyrics-panel.layout-horizontal .track-artist {
      font-size: 11px !important;
      font-weight: 600 !important;
    }

    .streamlyrics-panel.layout-horizontal .player-controls {
      margin-top: 0 !important;
      gap: 10px !important;
      flex-shrink: 0 !important;
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
