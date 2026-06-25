import React, { useState, useEffect, useCallback } from 'react';
import { Panel } from './components/Panel';
import { useSettings } from './hooks/useSettings';
import { loadGothamFont } from '../shared/gothamFont';

/**
 * Error boundary so a crash inside Panel/hooks doesn't leave a blank shadow
 * DOM. Users get a tiny fallback with a retry button.
 */
class PanelErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[StreamLyrics] Panel crashed:', error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div className="streamlyrics-error">
                <div>StreamLyrics ran into a problem.</div>
                <button
                    onClick={() => this.setState({ error: null })}
                    className="retry-btn"
                    type="button"
                >
                    Retry
                </button>
            </div>
        );
    }
}

interface AppProps {
    styles?: string;
    initialVisible?: boolean;
}

/**
 * Top-level app inside the shadow DOM. Owns:
 * - Persisted panel-visibility flag
 * - The TOGGLE_PANEL message listener (only one, here)
 * - Picture-in-Picture window lifecycle
 */
export const App: React.FC<AppProps> = ({ styles, initialVisible = false }) => {
    const [isVisible, setIsVisible] = useState(initialVisible);
    const [isLoaded, setIsLoaded] = useState(false);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);
    const isPipMode = pipWindow !== null;
    const settings = useSettings();

    // Restore saved visibility.
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            setIsLoaded(true);
            return;
        }
        chrome.storage.local.get(['panelVisible'], (result) => {
            if (result.panelVisible === true) setIsVisible(true);
            setIsLoaded(true);
        });
    }, []);

    // Persist visibility changes (after initial load).
    useEffect(() => {
        if (!isLoaded) return;
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
        chrome.storage.local.set({ panelVisible: isVisible });
    }, [isVisible, isLoaded]);

    // Single TOGGLE_PANEL listener for the whole app.
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

        const handleMessage = (message: { type: string }) => {
            if (message?.type !== 'TOGGLE_PANEL') return;
            setIsVisible((prev) => !prev);
        };

        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    // Detect PiP window close.
    useEffect(() => {
        if (!pipWindow) return;
        const handleUnload = () => setPipWindow(null);
        pipWindow.addEventListener('pagehide', handleUnload);
        return () => pipWindow.removeEventListener('pagehide', handleUnload);
    }, [pipWindow]);

    const openPipWindow = useCallback(async () => {
        if (!('documentPictureInPicture' in window)) {
            alert(
                'Always-on-top Picture-in-Picture is not supported in this browser. Please use Chrome 116+.',
            );
            return;
        }

        try {
            const pipWin = await (window as any).documentPictureInPicture.requestWindow({
                width: 400,
                height: 600,
            });

            await loadGothamFont(pipWin.document);
            setPipWindow(pipWin);

            const { documentElement, body, head } = pipWin.document;
            documentElement.style.width = '100%';
            documentElement.style.height = '100%';
            body.style.width = '100%';
            body.style.height = '100%';
            body.style.margin = '0';
            body.style.overflow = 'hidden';
            body.style.background = '#111';

            // Override the default title bar text (which would otherwise show
            // the host origin like "music.youtube.com") with our brand. The
            // Panel keeps it updated with the current track after this.
            pipWin.document.title = 'StreamLyrics';

            // Replace the favicon with our extension icon for the title bar.
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
                    const iconLink = pipWin.document.createElement('link');
                    iconLink.rel = 'icon';
                    iconLink.type = 'image/png';
                    iconLink.href = chrome.runtime.getURL('icons/icon48.png');
                    head.appendChild(iconLink);
                }
            } catch {
                /* ignore — favicon is best-effort */
            }

            if (styles) {
                const styleEl = pipWin.document.createElement('style');
                styleEl.textContent = styles;
                head.appendChild(styleEl);
            }
        } catch (error) {
            console.error('[StreamLyrics] Failed to open always-on-top PiP window:', error);
            alert(
                'Could not open the always-on-top Picture-in-Picture window. Please try again from an active Chrome tab.',
            );
        }
    }, [styles]);

    const closePipWindow = useCallback(() => {
        if (pipWindow) pipWindow.close();
        setPipWindow(null);
    }, [pipWindow]);

    if (!isLoaded) return null;

    const effectiveIsVisible = isVisible && settings.enabled;

    return (
        <PanelErrorBoundary>
            <Panel
                isVisible={effectiveIsVisible}
                isPipMode={isPipMode}
                pipWindow={pipWindow}
                onOpenPip={openPipWindow}
                onClosePip={closePipWindow}
                settings={settings}
            />
        </PanelErrorBoundary>
    );
};
