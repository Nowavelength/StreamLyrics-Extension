import React, { useState, useEffect } from 'react';
import { Panel } from './components/Panel';


/**
 * Main App component
 * Manages panel visibility and Picture-in-Picture mode
 */
export const App: React.FC<{ styles?: string; initialVisible?: boolean }> = ({ styles, initialVisible = false }) => {
    const [isVisible, setIsVisible] = useState(initialVisible);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isPipMode, setIsPipMode] = useState(false);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);

    // Load saved visibility state on mount
    useEffect(() => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(['panelVisible'], (result) => {
                if (result.panelVisible === true) {
                    setIsVisible(true);
                }
                setIsLoaded(true);
            });
        } else {
            setIsLoaded(true);
        }
    }, []);

    // Save visibility state when it changes
    useEffect(() => {
        if (isLoaded && typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ panelVisible: isVisible });
        }
    }, [isVisible, isLoaded]);

    // Listen for toggle messages from extension icon click
    useEffect(() => {
        const handleMessage = (message: { type: string }) => {
            if (message.type === 'TOGGLE_PANEL') {
                setIsVisible((prev) => {
                    const newValue = !prev;
                    console.log('[StreamLyrics] Panel toggled to:', newValue);
                    return newValue;
                });
            }
        };

        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener(handleMessage);
            return () => {
                chrome.runtime.onMessage.removeListener(handleMessage);
            };
        }
    }, []);

    // Handle PIP window close
    useEffect(() => {
        if (pipWindow) {
            const handleUnload = () => {
                console.log('[StreamLyrics] PIP window closed');
                setIsPipMode(false);
                setPipWindow(null);
            };

            pipWindow.addEventListener('unload', handleUnload);
            return () => {
                pipWindow.removeEventListener('unload', handleUnload);
            };
        }
    }, [pipWindow]);

    /**
     * Open Picture-in-Picture window
     */
    const openPipWindow = async () => {
        if (!('documentPictureInPicture' in window)) {
            alert('Picture-in-Picture is not supported in this browser. Please use Chrome 116+');
            return;
        }

        try {
            const pipWin = await (window as any).documentPictureInPicture.requestWindow({
                width: 400,
                height: 600,
            });

            console.log('[StreamLyrics] PIP window opened');
            setPipWindow(pipWin);
            setIsPipMode(true);

            pipWin.document.documentElement.style.width = '100%';
            pipWin.document.documentElement.style.height = '100%';
            pipWin.document.body.style.width = '100%';
            pipWin.document.body.style.height = '100%';
            pipWin.document.body.style.margin = '0';
            pipWin.document.body.style.overflow = 'hidden';
            pipWin.document.body.style.background = '#111';

            // Inject styles into PIP window
            if (styles) {
                const styleEl = pipWin.document.createElement('style');
                styleEl.textContent = styles;
                pipWin.document.head.appendChild(styleEl);

                // Add Google Fonts
                const fontLink = pipWin.document.createElement('link');
                fontLink.rel = 'stylesheet';
                fontLink.href = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&display=swap';
                pipWin.document.head.appendChild(fontLink);
            }

        } catch (error) {
            console.error('[StreamLyrics] Failed to open PIP window:', error);
        }
    };

    /**
     * Close Picture-in-Picture window
     */
    const closePipWindow = () => {
        if (pipWindow) {
            pipWindow.close();
        }
        setIsPipMode(false);
        setPipWindow(null);
    };

    // Don't render until we've loaded the saved state
    if (!isLoaded) return null;

    return (
        <Panel
            isVisible={isVisible}
            isPipMode={isPipMode}
            pipWindow={pipWindow}
            onOpenPip={openPipWindow}
            onClosePip={closePipWindow}
        />
    );
};
