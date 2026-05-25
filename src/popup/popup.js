// Default settings
const DEFAULT_SETTINGS = {
    enabled: true,
    panelWidth: 400,
    fontSize: 32,
};

// Tabs we want to push settings updates to.
const TARGET_TAB_PATTERNS = [
    'https://www.youtube.com/*',
    'https://music.youtube.com/*',
];

// DOM Elements
const enabledToggle = document.getElementById('enabled');
const panelWidthSlider = document.getElementById('panelWidth');
const widthValue = document.getElementById('widthValue');
const fontSizeSlider = document.getElementById('fontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const resetBtn = document.getElementById('resetBtn');

// Load settings from storage
async function loadSettings() {
    const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);

    enabledToggle.checked = result.enabled;
    panelWidthSlider.value = result.panelWidth;
    widthValue.textContent = `${result.panelWidth}px`;
    fontSizeSlider.value = result.fontSize;
    fontSizeValue.textContent = `${result.fontSize}px`;
}

/**
 * Push the given settings payload to every active YouTube/YouTube Music tab.
 * Tabs that don't have the content script loaded yet will throw, which we
 * silently ignore — those tabs will pick up the new value via
 * chrome.storage.onChanged on next load.
 */
async function broadcastSettings(settings) {
    const tabs = await chrome.tabs.query({ url: TARGET_TAB_PATTERNS });
    await Promise.all(
        tabs.map((tab) =>
            tab.id
                ? chrome.tabs
                      .sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings })
                      .catch(() => {
                          /* No content script in this tab yet — ignore. */
                      })
                : Promise.resolve()
        )
    );
}

// Save settings to storage
async function saveSettings(settings) {
    await chrome.storage.sync.set(settings);
    await broadcastSettings(settings);
}

// Event listeners
enabledToggle.addEventListener('change', (e) => {
    saveSettings({ enabled: e.target.checked });
});

panelWidthSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    widthValue.textContent = `${value}px`;
    saveSettings({ panelWidth: value });
});

fontSizeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    fontSizeValue.textContent = `${value}px`;
    saveSettings({ fontSize: value });
});

resetBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    loadSettings();
    await broadcastSettings(DEFAULT_SETTINGS);
});

// Initialize
loadSettings();
