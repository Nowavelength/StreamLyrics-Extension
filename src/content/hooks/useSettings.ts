import { useState, useEffect } from 'react';

export interface Settings {
    enabled: boolean;
    panelWidth: number;
    fontSize: number;
}

const DEFAULT_SETTINGS: Settings = {
    enabled: true,
    panelWidth: 400,
    fontSize: 32,
};

/**
 * Hook for managing extension settings
 * Syncs with chrome.storage and listens for updates from popup
 */
export function useSettings(): Settings {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

    // Load initial settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Check if chrome.storage is available
                if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
                    console.log('[StreamLyrics] Chrome storage not available, using defaults');
                    return;
                }

                const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);

                // Merge with defaults to ensure all fields exist
                setSettings({
                    enabled: result.enabled ?? DEFAULT_SETTINGS.enabled,
                    panelWidth: result.panelWidth ?? DEFAULT_SETTINGS.panelWidth,
                    fontSize: result.fontSize ?? DEFAULT_SETTINGS.fontSize,
                });
            } catch (error) {
                console.error('[StreamLyrics] Error loading settings:', error);
                // Keep defaults on error
            }
        };

        loadSettings();
    }, []);

    // Listen for settings updates from popup
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
            return;
        }

        const handleMessage = (message: { type: string; settings: Partial<Settings> }) => {
            if (message.type === 'SETTINGS_UPDATED') {
                setSettings((prev) => ({ ...prev, ...message.settings }));
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
        };
    }, []);

    // Also listen for storage changes (in case multiple tabs)
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
            return;
        }

        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            const newSettings: Partial<Settings> = {};

            if (changes.enabled) newSettings.enabled = changes.enabled.newValue;
            if (changes.panelWidth) newSettings.panelWidth = changes.panelWidth.newValue;
            if (changes.fontSize) newSettings.fontSize = changes.fontSize.newValue;

            if (Object.keys(newSettings).length > 0) {
                setSettings((prev) => ({ ...prev, ...newSettings }));
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    return settings;
}
