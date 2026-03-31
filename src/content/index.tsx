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
      height: calc(100% - 90px);
      margin-top: 90px;
      overflow-y: auto;
      padding: 20px 24px 40% 24px;
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
      height: calc(100% - 80px);
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
      opacity: 0.7;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: #FFFFFF;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
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
      opacity: 0.7;
      text-align: center;
      padding: 32px;
    }

    .no-lyrics-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .no-lyrics-text {
      font-size: 18px;
      font-weight: 600;
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

    // Re-init if navigated to a watch page AND it was already activated
    if (lastUrl.includes('/watch') && hasBeenActivated) {
      // Remove old instance
      const existing = document.getElementById(CONTAINER_ID);
      if (existing) {
        existing.remove();
      }

      setTimeout(() => init(true), 500); // Pass true to keep it visible
    }
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });
