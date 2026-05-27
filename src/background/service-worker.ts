/**
 * StreamLyrics service worker.
 *
 * - Initializes default settings only on fresh install (does not stomp user
 *   choices on extension updates).
 * - When the user clicks the toolbar icon, sends a TOGGLE_PANEL message to the
 *   active tab. If the content script has not been injected yet (e.g. tab was
 *   opened before install), uses chrome.scripting to inject it on demand and
 *   then re-sends the toggle.
 */

const DEFAULT_SETTINGS = {
    enabled: true,
    panelWidth: 400,
    fontSize: 32,
};

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // Fresh install: seed defaults.
        await chrome.storage.sync.set(DEFAULT_SETTINGS);
        return;
    }

    // Update / browser update / chrome restart: only fill in missing keys so we
    // never reset values the user has explicitly configured.
    const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const filled: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (current[key] === undefined) {
            filled[key] = value;
        }
    }
    if (Object.keys(filled).length > 0) {
        await chrome.storage.sync.set(filled);
    }
});

/**
 * Try to message the content script. If it's not loaded yet, inject it and
 * retry once.
 */
async function toggleOrInject(tabId: number, tabUrl: string | undefined): Promise<void> {
    try {
        await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_PANEL' });
        return;
    } catch {
        // Content script not present.
    }

    // Only inject on supported pages.
    const isSupported = !!tabUrl && (
        /^https:\/\/(www\.)?youtube\.com\/watch/.test(tabUrl) ||
        /^https:\/\/music\.youtube\.com\//.test(tabUrl)
    );
    if (!isSupported) {
        console.warn('[StreamLyrics] Tab is not a supported YouTube page; cannot inject.');
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['src/content/index.tsx'],
        });
        // Give the script a tick to register its onMessage listener.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_PANEL' });
    } catch (err) {
        console.error('[StreamLyrics] Failed to inject content script:', err);
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    await toggleOrInject(tab.id, tab.url);
});
