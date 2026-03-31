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

    // Send toggle message to content script
    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
    } catch (error) {
        console.log('Content script not ready, injecting...');
    }
});
