// Default settings
const DEFAULT_SETTINGS = {
    enabled: true,
    panelWidth: 400,
    fontSize: 32,
};

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

// Save settings to storage
async function saveSettings(settings) {
    await chrome.storage.sync.set(settings);

    // Notify content script of changes
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings });
    }
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

    // Notify content script
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: DEFAULT_SETTINGS });
    }
});

// Initialize
loadSettings();
