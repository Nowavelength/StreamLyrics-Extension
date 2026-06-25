import { loadGothamFont } from '../shared/gothamFont';

void loadGothamFont(document);

// Default settings - kept in sync with src/background/service-worker.ts
const DEFAULT_SETTINGS = {
    enabled: true,
    panelWidth: 400,
    fontSize: 32,
};

const TARGET_URLS = [
    'https://www.youtube.com/*',
    'https://music.youtube.com/*',
];

const $ = (id) => document.getElementById(id);

const enabledToggle = $('enabled');
const panelWidthSlider = $('panelWidth');
const widthValue = $('widthValue');
const fontSizeSlider = $('fontSize');
const fontSizeValue = $('fontSizeValue');
const resetBtn = $('resetBtn');

if (!enabledToggle || !panelWidthSlider || !widthValue || !fontSizeSlider || !fontSizeValue || !resetBtn) {
    console.error('[StreamLyrics] popup.html is missing expected elements');
}

async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        if (enabledToggle) enabledToggle.checked = result.enabled;
        if (panelWidthSlider) panelWidthSlider.value = result.panelWidth;
        if (widthValue) widthValue.textContent = `${result.panelWidth}px`;
        if (fontSizeSlider) fontSizeSlider.value = result.fontSize;
        if (fontSizeValue) fontSizeValue.textContent = `${result.fontSize}px`;
    } catch (err) {
        console.error('[StreamLyrics] Failed to load settings:', err);
    }
}

async function broadcastSettings(settings) {
    try {
        const tabs = await chrome.tabs.query({ url: TARGET_URLS });
        await Promise.all(
            tabs.map((tab) =>
                tab.id
                    ? chrome.tabs
                          .sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings })
                          .catch(() => {
                              /* tab may not have content script yet — ignore */
                          })
                    : Promise.resolve()
            )
        );
    } catch (err) {
        console.error('[StreamLyrics] Failed to broadcast settings:', err);
    }
}

async function saveSettings(partial) {
    try {
        await chrome.storage.sync.set(partial);
        await broadcastSettings(partial);
    } catch (err) {
        console.error('[StreamLyrics] Failed to save settings:', err);
    }
}

if (enabledToggle) {
    enabledToggle.addEventListener('change', (e) => {
        saveSettings({ enabled: e.target.checked });
    });
}

if (panelWidthSlider && widthValue) {
    panelWidthSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        widthValue.textContent = `${value}px`;
        saveSettings({ panelWidth: value });
    });
}

if (fontSizeSlider && fontSizeValue) {
    fontSizeSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        fontSizeValue.textContent = `${value}px`;
        saveSettings({ fontSize: value });
    });
}

if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
        await chrome.storage.sync.set(DEFAULT_SETTINGS);
        await loadSettings();
        await broadcastSettings(DEFAULT_SETTINGS);
    });
}

loadSettings();
