import { createRoot, Root } from 'react-dom/client';
import { App } from './App';
import panelStyles from './styles/panel.css?inline';
import { loadAppFonts } from '../shared/appFonts';

/**
 * StreamLyrics content script entry point.
 * Injects the React app into a Shadow DOM on YouTube / YouTube Music pages.
 */

const CONTAINER_ID = 'streamlyrics-root';
const MAX_PLAYER_WAIT_MS = 30_000; // give up looking for the player after 30s

let hasBeenActivated = false;
let reactRoot: Root | null = null;
let waitTimer: number | null = null;
let urlObserver: MutationObserver | null = null;

// ----- Message handling --------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'TOGGLE_PANEL') return;
    if (!hasBeenActivated) {
        console.log('[StreamLyrics] Activation signal received');
        hasBeenActivated = true;
        init(true);
    }
    // After activation, App.tsx handles its own toggle messaging.
});

// ----- Bootstrapping -----------------------------------------------------
function init(initialVisible = false) {
    if (document.getElementById(CONTAINER_ID)) return;
    waitForPlayer(initialVisible, performance.now());
}

function waitForPlayer(initialVisible: boolean, startedAt: number) {
    const player =
        document.querySelector('#movie_player') ||
        document.querySelector('ytmusic-player') ||
        document.querySelector('#player') ||
        document.querySelector('video');

    if (player) {
        injectApp(initialVisible);
        return;
    }

    if (performance.now() - startedAt > MAX_PLAYER_WAIT_MS) {
        console.warn('[StreamLyrics] Gave up waiting for YouTube player.');
        return;
    }

    waitTimer = window.setTimeout(
        () => waitForPlayer(initialVisible, startedAt),
        500,
    );
}

function injectApp(initialVisible: boolean) {
    if (document.getElementById(CONTAINER_ID)) return;

    void loadAppFonts(document);

    const host = document.createElement('div');
    host.id = CONTAINER_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = panelStyles;
    shadow.appendChild(style);

    const mountPoint = document.createElement('div');
    mountPoint.id = 'streamlyrics-mount';
    shadow.appendChild(mountPoint);

    reactRoot = createRoot(mountPoint);
    reactRoot.render(
        <App styles={panelStyles} initialVisible={initialVisible} />,
    );
    console.log('[StreamLyrics] Injected successfully.');
}

// ----- SPA navigation ----------------------------------------------------
let lastUrl = window.location.href;
urlObserver = new MutationObserver(() => {
    if (window.location.href === lastUrl) return;
    lastUrl = window.location.href;

    // Re-inject if YouTube tore the host node out of the DOM (rare but happens
    // on hard navigations). We deliberately keep the existing React instance
    // mounted on soft navigations to preserve PiP/popout state.
    if (hasBeenActivated && !document.getElementById(CONTAINER_ID)) {
        window.setTimeout(() => init(true), 500);
    }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Tear everything down if the page is being unloaded (BFCache miss, etc.).
window.addEventListener('pagehide', () => {
    if (waitTimer != null) {
        clearTimeout(waitTimer);
        waitTimer = null;
    }
    if (urlObserver) {
        urlObserver.disconnect();
        urlObserver = null;
    }
    if (reactRoot) {
        try {
            reactRoot.unmount();
        } catch {
            /* ignore */
        }
        reactRoot = null;
    }
});
