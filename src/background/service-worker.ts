// Service worker for StreamLyrics extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('StreamLyrics extension installed');
    // Initialize default settings
    chrome.storage.sync.set({
        enabled: true,
        panelWidth: 400,
        fontSize: 32,
    });
});

// Handle extension icon click - toggle the panel
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    // Try to send the toggle message to an already-loaded content script.
    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
        return;
    } catch (error) {
        // No content script in this tab yet (e.g. tab was opened before the
        // extension was installed/reloaded). Fall through to inject it.
        console.log('[StreamLyrics] Content script not present, injecting...');
    }

    // Inject the content script declared in the manifest, then retry.
    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts ?? [];

    for (const cs of contentScripts) {
        if (!cs.js || cs.js.length === 0) continue;
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: cs.js,
            });
        } catch (err) {
            console.error('[StreamLyrics] Failed to inject content script:', err);
            return;
        }
    }

    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    } catch (err) {
        console.error('[StreamLyrics] Toggle retry failed after injection:', err);
    }
});
