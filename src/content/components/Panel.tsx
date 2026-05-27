import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LyricLine as LyricLineComponent } from './LyricLine';
import { useVideoSync } from '../hooks/useVideoSync';
import { useTranscript } from '../hooks/useTranscript';
import { useDominantColor } from '../hooks/useDominantColor';
import { useAudioBars } from '../hooks/useAudioBars';
import {
    PrevIcon,
    NextIcon,
    PlayIcon,
    PauseIcon,
    RewindIcon,
    FastForwardIcon,
    SearchIcon,
    DownloadIcon,
    RefreshIcon,
} from './icons';
import { storageService } from '../services/storageService';
import {
    cleanVideoTitle,
    getCurrentTrackInfo,
    getLyricsSearchTitle,
    getVideoId,
} from '../utils/transcriptParser';
import { getThumbnailUrl, vibrantize } from '../utils/colorExtractor';
import { AbstractThumbnail } from './AbstractThumbnail';
import { Settings } from '../hooks/useSettings';

interface PanelProps {
    isVisible: boolean;
    isPipMode: boolean;
    pipWindow: Window | null;
    onOpenPip: () => void;
    onClosePip: () => void;
    settings: Settings;
}

const INSTRUMENTAL_GAP_THRESHOLD = 10; // seconds
const INTRO_INSTRUMENTAL_THRESHOLD = 6; // seconds — show note before first lyric
const MIN_WIDTH = 180;
const MAX_WIDTH = 700;
const MIN_HEIGHT = 48;
const MAX_HEIGHT = 800;

const THRESHOLD_ULTRA_ENTER_HEIGHT = 80;
const THRESHOLD_ULTRA_EXIT_HEIGHT = 100;
const THRESHOLD_MINI_ENTER_AREA = 135_000;
const THRESHOLD_MINI_EXIT_AREA = 155_000;

// chrome.storage.local key for panel layout persistence.
const LAYOUT_STORAGE_KEY = 'streamlyrics_panel_layout';

interface PersistedLayout {
    width: number;
    height: number;
    x: number;
    y: number;
    dockCollapsed?: boolean;
}

const DEFAULT_LAYOUT: PersistedLayout = {
    width: 380,
    height: 500,
    x: Math.max(20, window.innerWidth - 400),
    y: 80,
    dockCollapsed: false,
};

export type PlayerMode = 'full' | 'mini' | 'ultra';

// ---------- Small SVG helpers (unchanged) --------------------------------
const GripGrid2x4: React.FC = () => (
    <svg width="12" height="6" viewBox="0 0 12 6" fill="currentColor" style={{ opacity: 0.4, display: 'block' }}>
        <circle cx="1" cy="1" r="1" /><circle cx="4" cy="1" r="1" /><circle cx="7" cy="1" r="1" /><circle cx="10" cy="1" r="1" />
        <circle cx="1" cy="5" r="1" /><circle cx="4" cy="5" r="1" /><circle cx="7" cy="5" r="1" /><circle cx="10" cy="5" r="1" />
    </svg>
);

const GripGrid2x3: React.FC = () => (
    <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor" style={{ opacity: 0.4, display: 'block' }}>
        <circle cx="1" cy="2" r="1" /><circle cx="1" cy="5" r="1" /><circle cx="1" cy="8" r="1" />
        <circle cx="5" cy="2" r="1" /><circle cx="5" cy="5" r="1" /><circle cx="5" cy="8" r="1" />
    </svg>
);

const Rewind5Icon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <text x="12" y="15" fontSize="8" fontWeight="bold" fill="currentColor" textAnchor="middle" stroke="none">5</text>
    </svg>
);

const Forward5Icon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <text x="12" y="15" fontSize="8" fontWeight="bold" fill="currentColor" textAnchor="middle" stroke="none">5</text>
    </svg>
);

// ---------- Mode hysteresis ----------------------------------------------
export const getNextPlayerMode = (
    width: number,
    height: number,
    currentMode: PlayerMode,
): PlayerMode => {
    const area = width * height;
    const ultraThreshold =
        currentMode === 'ultra' ? THRESHOLD_ULTRA_EXIT_HEIGHT : THRESHOLD_ULTRA_ENTER_HEIGHT;

    if (height <= ultraThreshold) return 'ultra';

    const shouldBeMini = area <= THRESHOLD_MINI_ENTER_AREA;

    if (currentMode === 'ultra') return shouldBeMini ? 'mini' : 'full';
    if (currentMode === 'mini') return area > THRESHOLD_MINI_EXIT_AREA ? 'full' : 'mini';
    return shouldBeMini ? 'mini' : 'full';
};

// ---------- Helpers ------------------------------------------------------
async function loadPersistedLayout(settingsWidth: number): Promise<PersistedLayout> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return { ...DEFAULT_LAYOUT, width: settingsWidth };
    }
    try {
        const result = await chrome.storage.local.get(LAYOUT_STORAGE_KEY);
        const stored = result[LAYOUT_STORAGE_KEY] as Partial<PersistedLayout> | undefined;
        if (!stored) return { ...DEFAULT_LAYOUT, width: settingsWidth };
        return {
            width: clamp(stored.width ?? settingsWidth, MIN_WIDTH, MAX_WIDTH),
            height: clamp(stored.height ?? DEFAULT_LAYOUT.height, MIN_HEIGHT, MAX_HEIGHT),
            x: clamp(stored.x ?? DEFAULT_LAYOUT.x, 0, Math.max(0, window.innerWidth - 100)),
            y: clamp(stored.y ?? DEFAULT_LAYOUT.y, 0, Math.max(0, window.innerHeight - 100)),
            dockCollapsed: stored.dockCollapsed ?? false,
        };
    } catch {
        return { ...DEFAULT_LAYOUT, width: settingsWidth };
    }
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

// =========================================================================
// Main Panel
// =========================================================================
export const Panel: React.FC<PanelProps> = ({
    isVisible,
    isPipMode,
    pipWindow,
    onOpenPip,
    onClosePip,
    settings,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
    const panelRef = useRef<HTMLDivElement>(null);

    // Layout state — initialized synchronously from settings, hydrated async
    // from chrome.storage.local on mount.
    const [panelWidth, setPanelWidth] = useState(settings?.panelWidth ?? DEFAULT_LAYOUT.width);
    const [panelHeight, setPanelHeight] = useState(DEFAULT_LAYOUT.height);
    const [panelX, setPanelX] = useState(() =>
        Math.max(20, window.innerWidth - (settings?.panelWidth ?? DEFAULT_LAYOUT.width) - 20),
    );
    const [panelY, setPanelY] = useState(DEFAULT_LAYOUT.y);
    const [dockCollapsed, setDockCollapsed] = useState(false);

    const lastFullSizeRef = useRef<{ width: number; height: number }>({
        width: panelWidth,
        height: panelHeight,
    });

    // Hydrate persisted layout once on mount.
    useEffect(() => {
        let cancelled = false;
        loadPersistedLayout(settings?.panelWidth ?? DEFAULT_LAYOUT.width).then((layout) => {
            if (cancelled) return;
            setPanelWidth(layout.width);
            setPanelHeight(layout.height);
            setPanelX(layout.x);
            setPanelY(layout.y);
            setDockCollapsed(layout.dockCollapsed ?? false);
            // Snap the smoothing state to the hydrated values too — otherwise
            // the panel briefly renders at the default (380×500) while the
            // smoothing RAF lerps down to the persisted size, which makes the
            // pill look gigantic for a moment after restore.
            setSmoothWidth(layout.width);
            setSmoothHeight(layout.height);
            // Compute the player mode in the same batch so we never paint a
            // wrong-mode frame (e.g. full-mode UI at 500×60 ultra dimensions).
            const hydratedMode = getNextPlayerMode(layout.width, layout.height, 'full');
            setPlayerMode(hydratedMode);
            // Only treat the persisted size as "last full size" if the user
            // was actually in full mode. Otherwise pressing expand later
            // would restore to ultra/mini dimensions (still cramped).
            if (hydratedMode === 'full') {
                lastFullSizeRef.current = { width: layout.width, height: layout.height };
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Sync settings.panelWidth → local panelWidth when changed externally
    // (e.g. via the options page).
    const lastStoredWidthRef = useRef(settings?.panelWidth ?? DEFAULT_LAYOUT.width);
    useEffect(() => {
        if (
            settings?.panelWidth &&
            settings.panelWidth !== lastStoredWidthRef.current
        ) {
            lastStoredWidthRef.current = settings.panelWidth;
            setPanelWidth(settings.panelWidth);
        }
    }, [settings?.panelWidth]);

    // PiP window dimensions.
    const [pipWidth, setPipWidth] = useState(window.innerWidth);
    const [pipHeight, setPipHeight] = useState(window.innerHeight);

    const activeWidth = isPipMode ? pipWidth : panelWidth;
    const activeHeight = isPipMode ? pipHeight : panelHeight;

    const [playerMode, setPlayerMode] = useState<PlayerMode>(() =>
        getNextPlayerMode(activeWidth, activeHeight, 'full'),
    );

    // Track the user's last "full" panel size so handleExpand can restore it.
    useEffect(() => {
        if (playerMode === 'full' && !isPipMode) {
            lastFullSizeRef.current = { width: panelWidth, height: panelHeight };
        }
    }, [playerMode, panelWidth, panelHeight, isPipMode]);

    useEffect(() => {
        if (!isPipMode || !pipWindow) return;
        setPipWidth(pipWindow.innerWidth);
        setPipHeight(pipWindow.innerHeight);

        const handleResize = () => {
            setPipWidth(pipWindow.innerWidth);
            setPipHeight(pipWindow.innerHeight);
        };
        pipWindow.addEventListener('resize', handleResize);
        return () => pipWindow.removeEventListener('resize', handleResize);
    }, [isPipMode, pipWindow]);

    useEffect(() => {
        setPlayerMode((prev) => getNextPlayerMode(activeWidth, activeHeight, prev));
    }, [activeWidth, activeHeight]);

    // ---------- Lyrics + audio ------------------------------------------
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

    const {
        lines,
        isLoading,
        error,
        source,
        currentTitle,
        refetch,
        searchManual,
        switchSource,
        tryNextResult,
        hasMoreResults,
        initialOffset,
    } = useTranscript();
    const {
        currentLineIndex,
        isPaused,
        currentTime,
        offset,
        seekTo,
        adjustOffset,
        resetOffset,
        togglePlayPause,
        setLineIndex,
    } = useVideoSync(lines, initialOffset);
    const backgroundColor = useDominantColor(thumbnailUrl);
    const vibrantBarColor = useMemo(() => vibrantize(backgroundColor), [backgroundColor]);
    const bars = useAudioBars(32);

    const [manualArtist, setManualArtist] = useState('');
    const [manualTrack, setManualTrack] = useState('');
    const [isSearchVisible, setIsSearchVisible] = useState(false);

    // Lyric snapshot tracking for slide-in / slide-out animations in ultra
    // mode. We hold the previous line briefly so it can slide up and out
    // while the new line slides up into view.
    const [displayedLyric, setDisplayedLyric] = useState<{ text: string; fontSize: number }>({
        text: '',
        fontSize: 13,
    });
    const [previousLyric, setPreviousLyric] = useState<{ text: string; fontSize: number } | null>(null);

    // Smooth dimension changes — stops requesting frames once settled.
    const [smoothWidth, setSmoothWidth] = useState(activeWidth);
    const [smoothHeight, setSmoothHeight] = useState(activeHeight);

    useEffect(() => {
        let rafId = 0;
        let stopped = false;

        const step = () => {
            if (stopped) return;
            let stillAnimating = false;

            setSmoothWidth((prev) => {
                const diff = activeWidth - prev;
                if (Math.abs(diff) < 0.5) return activeWidth;
                stillAnimating = true;
                return prev + diff * 0.18;
            });
            setSmoothHeight((prev) => {
                const diff = activeHeight - prev;
                if (Math.abs(diff) < 0.5) return activeHeight;
                stillAnimating = true;
                return prev + diff * 0.18;
            });

            if (stillAnimating) rafId = requestAnimationFrame(step);
        };

        rafId = requestAnimationFrame(step);
        return () => {
            stopped = true;
            cancelAnimationFrame(rafId);
        };
    }, [activeWidth, activeHeight]);

    // ---------- Thumbnail discovery -------------------------------------
    const updateThumbnailUrl = useCallback(() => {
        const ytMusicThumb = document.querySelector(
            'ytmusic-player-bar img.image',
        ) as HTMLImageElement | null;
        if (ytMusicThumb?.src) {
            setThumbnailUrl(ytMusicThumb.src);
            return;
        }

        const ytMusicArt = document.querySelector(
            '.ytmusic-player img',
        ) as HTMLImageElement | null;
        if (ytMusicArt?.src) {
            setThumbnailUrl(ytMusicArt.src);
            return;
        }

        const videoId = getVideoId();
        if (videoId) {
            setThumbnailUrl(getThumbnailUrl(videoId));
            return;
        }

        setThumbnailUrl(null);
    }, []);

    useEffect(() => {
        updateThumbnailUrl();
        const t1 = window.setTimeout(updateThumbnailUrl, 500);
        const t2 = window.setTimeout(updateThumbnailUrl, 1500);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [currentTitle, isLoading, updateThumbnailUrl]);

    // ---------- Track metadata ------------------------------------------
    const videoTitle = getLyricsSearchTitle(getCurrentTrackInfo());
    const { artist: cleanArtist, track: cleanTrack } = cleanVideoTitle(currentTitle || videoTitle);

    // ---------- Ultra-mode lyric snapshot transitions -------------------
    const currentLineText =
        currentLineIndex >= 0 && lines[currentLineIndex]
            ? lines[currentLineIndex].text
            : '';
    const ultraLyricFontSize =
        currentLineText.length > 50
            ? 11
            : currentLineText.length > 25
              ? 12
              : 13;

    useEffect(() => {
        if (currentLineText === displayedLyric.text) return;
        // Move the currently-displayed lyric into "previous" so it can slide
        // up and out, then update displayed to the new text. After the
        // animation duration, drop the previous snapshot.
        setPreviousLyric(displayedLyric.text ? displayedLyric : null);
        setDisplayedLyric({ text: currentLineText, fontSize: ultraLyricFontSize });
        const timer = setTimeout(() => setPreviousLyric(null), 360);
        return () => clearTimeout(timer);
    }, [currentLineText, ultraLyricFontSize, displayedLyric]);

    // Update the PiP window's document title (shown in the OS-level title
    // bar) so it reads "Track — Artist — StreamLyrics" instead of the host
    // origin (e.g. "music.youtube.com").
    useEffect(() => {
        if (!isPipMode || !pipWindow) return;
        const trackName = cleanTrack || currentTitle;
        const fullTitle = trackName
            ? cleanArtist
                ? `${trackName} • ${cleanArtist} — StreamLyrics`
                : `${trackName} — StreamLyrics`
            : 'StreamLyrics';
        try {
            pipWindow.document.title = fullTitle;
        } catch {
            /* PiP window may be closing — ignore */
        }
    }, [isPipMode, pipWindow, cleanTrack, cleanArtist, currentTitle]);

    // ---------- Persistence: write panel layout to chrome.storage.local --
    const persistLayout = useCallback(
        (next: Partial<PersistedLayout>) => {
            if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
            const layout: PersistedLayout = {
                width: panelWidth,
                height: panelHeight,
                x: panelX,
                y: panelY,
                dockCollapsed,
                ...next,
            };
            chrome.storage.local.set({ [LAYOUT_STORAGE_KEY]: layout });
        },
        [panelWidth, panelHeight, panelX, panelY, dockCollapsed],
    );

    const toggleDock = useCallback(() => {
        setDockCollapsed((prev) => {
            const next = !prev;
            persistLayout({ dockCollapsed: next });
            return next;
        });
    }, [persistLayout]);

    // ---------- Player controls -----------------------------------------
    const handleExpand = useCallback(() => {
        const last = lastFullSizeRef.current;
        const restoredW = clamp(last.width || DEFAULT_LAYOUT.width, MIN_WIDTH, MAX_WIDTH);
        const restoredH = clamp(last.height || DEFAULT_LAYOUT.height, 220, MAX_HEIGHT);
        setPanelWidth(restoredW);
        setPanelHeight(restoredH);
        setPlayerMode('full');
        persistLayout({ width: restoredW, height: restoredH });
        if (isPipMode && pipWindow) {
            try {
                pipWindow.resizeTo(restoredW, restoredH);
            } catch (e) {
                console.warn('[StreamLyrics] Failed to resize PiP window:', e);
            }
        }
    }, [isPipMode, pipWindow, persistLayout]);

    const skipVideo = useCallback(
        (delta: number) => {
            seekTo(Math.max(0, currentTime + delta));
        },
        [currentTime, seekTo],
    );

    const prevSong = useCallback(() => {
        const btn = document.querySelector(
            '.ytp-prev-button, ytmusic-player-bar .previous-button',
        ) as HTMLElement | null;
        btn?.click();
    }, []);

    const nextSong = useCallback(() => {
        const btn = document.querySelector(
            '.ytp-next-button, ytmusic-player-bar .next-button',
        ) as HTMLElement | null;
        btn?.click();
    }, []);

    // ---------- Drag / resize -------------------------------------------
    const handleDragStart = useCallback(
        (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                target.closest(
                    '.resize-handle, .offset-btn, .source-btn, .lyric-line, .manual-search, .retry-btn, .player-btn, .spotify-btn, .spotify-pill-btn, .spotify-close-dot',
                )
            ) {
                return;
            }
            if (playerMode === 'full' && target.closest('.player-dock')) return;

            e.preventDefault();
            setIsDragging(true);
            setDragOffset({ x: e.clientX - panelX, y: e.clientY - panelY });
        },
        [panelX, panelY, playerMode],
    );

    const handleResizeStart = useCallback(
        (direction: string) =>
            (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setIsResizing(direction);
            },
        [],
    );

    useEffect(() => {
        if (!isDragging && !isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                const newX = clamp(
                    e.clientX - dragOffset.x,
                    0,
                    Math.max(0, window.innerWidth - panelWidth),
                );
                const newY = clamp(
                    e.clientY - dragOffset.y,
                    0,
                    Math.max(0, window.innerHeight - panelHeight),
                );
                setPanelX(newX);
                setPanelY(newY);
            }

            if (isResizing) {
                if (isResizing.includes('e')) {
                    const max = Math.min(MAX_WIDTH, window.innerWidth - panelX);
                    setPanelWidth(clamp(e.clientX - panelX, MIN_WIDTH, max));
                }
                if (isResizing.includes('w')) {
                    const newWidth = panelX + panelWidth - e.clientX;
                    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH && e.clientX >= 0) {
                        setPanelX(e.clientX);
                        setPanelWidth(newWidth);
                    }
                }
                if (isResizing.includes('s')) {
                    const max = Math.min(MAX_HEIGHT, window.innerHeight - panelY);
                    setPanelHeight(clamp(e.clientY - panelY, MIN_HEIGHT, max));
                }
                if (isResizing.includes('n')) {
                    const newHeight = panelY + panelHeight - e.clientY;
                    if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT && e.clientY >= 0) {
                        setPanelY(e.clientY);
                        setPanelHeight(newHeight);
                    }
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(null);

            // Persist full layout (not just width).
            persistLayout({});

            // Sync to chrome.storage.sync (drives popup slider) only when in
            // full mode.
            if (
                playerMode === 'full' &&
                typeof chrome !== 'undefined' &&
                chrome.storage?.sync
            ) {
                chrome.storage.sync.set({ panelWidth });
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [
        isDragging,
        isResizing,
        panelX,
        panelY,
        panelWidth,
        panelHeight,
        dragOffset,
        playerMode,
        persistLayout,
    ]);

    // ---------- Instrumental detection ----------------------------------
    const isInstrumental = (): boolean => {
        if (lines.length === 0) return false;

        // Intro instrumental — before the first lyric line.
        if (currentLineIndex < 0) {
            const firstStart = lines[0].start - offset;
            return firstStart - currentTime > INTRO_INSTRUMENTAL_THRESHOLD;
        }

        if (currentLineIndex >= lines.length - 1) return false;
        const currentLine = lines[currentLineIndex];
        const nextLine = lines[currentLineIndex + 1];
        return (
            !!nextLine &&
            nextLine.start - currentLine.start - currentLine.duration >
                INSTRUMENTAL_GAP_THRESHOLD
        );
    };

    // ---------- Auto-scroll ---------------------------------------------
    useEffect(() => {
        if (currentLineIndex < 0 || !scrollRef.current) return;
        const el = lineRefs.current[currentLineIndex];
        if (!el) return;

        const container = scrollRef.current;
        const scrollTarget = el.offsetTop - container.clientHeight * 0.45;
        container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }, [currentLineIndex]);

    const handleLineClick = (index: number) => {
        if (!lines[index]) return;
        // Update active line immediately so the user sees instant feedback.
        setLineIndex(index);
        seekTo(Math.max(0, lines[index].start - offset));
    };

    const handleManualSearch = (e: React.FormEvent) => {
        e.preventDefault();
        searchManual(manualArtist, manualTrack);
    };

    const handleDownload = async () => {
        if (!lines || lines.length === 0) return;

        // Bake the current offset into timestamps so the saved .lrc plays back
        // correctly without the offset.
        const adjustedLines = lines.map((line) => ({
            ...line,
            start: Math.max(0, line.start - offset),
        }));

        const lrcContent = adjustedLines
            .map((line) => {
                const minutes = Math.floor(line.start / 60);
                const seconds = Math.floor(line.start % 60);
                const ms = Math.floor((line.start % 1) * 100);
                const ts = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
                return `${ts}${line.text}`;
            })
            .join('\n');

        const blob = new Blob([lrcContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const { artist, track } = cleanVideoTitle(getLyricsSearchTitle(getCurrentTrackInfo()));
        a.download = `${artist} - ${track}.lrc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        await storageService.saveLyrics(artist, track, adjustedLines);
        switchSource('local');
        resetOffset();
    };

    const handleDeleteLocal = async () => {
        const { artist, track } = cleanVideoTitle(getLyricsSearchTitle(getCurrentTrackInfo()));
        if (!confirm(`Delete saved lyrics for "${track}" by ${artist}?`)) return;
        await storageService.deleteLyrics(artist, track);
        // Refetch from API sources instead of forcing a full page reload.
        refetch();
    };

    // ---------- Style ---------------------------------------------------
    const panelStyle: React.CSSProperties = isPipMode
        ? {
              backgroundColor: playerMode === 'full' ? backgroundColor : '#121212',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              ['--lyric-font-size' as any]: `${settings.fontSize}px`,
          }
        : {
              backgroundColor: playerMode === 'full' ? backgroundColor : '#121212',
              width: `${smoothWidth}px`,
              height: `${smoothHeight}px`,
              left: `${panelX}px`,
              top: `${panelY}px`,
              right: 'auto',
              bottom: 'auto',
              position: 'fixed',
              cursor: isDragging ? 'grabbing' : 'grab',
              ['--lyric-font-size' as any]: `${settings.fontSize}px`,
          };

    const renderPanel = (content: React.ReactElement) =>
        isPipMode && pipWindow ? createPortal(content, pipWindow.document.body) : content;

    // ====================================================================
    // Mode renders
    // ====================================================================
    if (playerMode === 'mini') {
        const titleText = cleanTrack || currentTitle || 'No title';
        const artistText = cleanArtist || 'Unknown artist';

        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} mode-mini ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="spotify-header">
                    <button
                        className="spotify-close-dot"
                        onClick={handleExpand}
                        title="Expand to Full Lyrics"
                        aria-label="Expand panel"
                    />
                    <div className="spotify-grip-center">
                        <GripGrid2x4 />
                    </div>
                </div>

                <div className="spotify-body">
                    <div
                        className="spotify-ambient-backdrop"
                        style={{
                            background: `radial-gradient(circle, ${backgroundColor} 0%, rgba(18,18,18,0.9) 100%)`,
                        }}
                    />
                    <div className="spotify-artwork-card">
                        {thumbnailUrl ? (
                            <img
                                src={thumbnailUrl}
                                alt="Album Art"
                                className="spotify-album-art"
                                draggable="false"
                            />
                        ) : (
                            <AbstractThumbnail size={170} active={isVisible} />
                        )}
                        <div className="spotify-hover-overlay">
                            <div className="spotify-controls-row">
                                <button className="spotify-btn prev-btn" onClick={prevSong} title="Previous Song" aria-label="Previous">
                                    <PrevIcon size={14} />
                                </button>
                                <button className="spotify-btn rewind-btn" onClick={() => skipVideo(-5)} title="Rewind 5s" aria-label="Rewind 5s">
                                    <Rewind5Icon />
                                </button>
                                <button className="spotify-btn play-btn" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                                    {isPaused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
                                </button>
                                <button className="spotify-btn forward-btn" onClick={() => skipVideo(5)} title="Forward 5s" aria-label="Forward 5s">
                                    <Forward5Icon />
                                </button>
                                <button className="spotify-btn next-btn" onClick={nextSong} title="Next Song" aria-label="Next">
                                    <NextIcon size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="spotify-mini-viz" aria-hidden="true">
                    {bars.slice(8, 24).map((h, i) => (
                        <span
                            key={i}
                            className="viz-bar"
                            style={{ height: `${Math.max(2, h * 14)}px`, animationDelay: `${i * 0.04}s`, background: vibrantBarColor }}
                        />
                    ))}
                </div>

                <div className="spotify-footer">
                    <div className="spotify-track-title" title={titleText}>{titleText}</div>
                    <div className="spotify-track-artist" title={artistText}>{artistText}</div>
                </div>
            </div>,
        );
    }

    if (playerMode === 'ultra') {
        const titleText = cleanTrack || currentTitle || 'No title';
        const artistText = cleanArtist || 'Unknown artist';
        const tooltipText = artistText
            ? `${titleText} — ${artistText}`
            : titleText;
        // 5 chunky bars across the FFT spectrum (mix of bass + treble for
        // visual variety). Bars hook is mirrored so center = bass.
        const ULTRA_BAR_INDICES = [3, 9, 15, 22, 28];
        // Only render the lyric area when the pill is wide enough to give
        // it a meaningful slice of space (~155px after fixed chrome).
        const showUltraLyric = activeWidth >= 380;

        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} mode-ultra ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="spotify-pill-content">
                    <div className="spotify-pill-left">
                        <button className="spotify-close-dot" onClick={handleExpand} title="Expand to Full Lyrics" aria-label="Expand panel" />
                        <div className="spotify-pill-grip">
                            <GripGrid2x3 />
                        </div>
                    </div>
                    <div className="spotify-pill-artwork" title={tooltipText}>
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt={tooltipText} className="spotify-pill-img" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={28} active={isVisible} />
                        )}
                    </div>
                    {showUltraLyric ? (
                        <div className="spotify-pill-lyric-stack" aria-live="polite">
                            {previousLyric && previousLyric.text && (
                                <div className="spotify-pill-lyric pill-lyric-leaving">
                                    <span
                                        className="pill-lyric-text"
                                        style={{ fontSize: `${previousLyric.fontSize}px` }}
                                    >
                                        {previousLyric.text}
                                    </span>
                                </div>
                            )}
                            {displayedLyric.text && (
                                <div
                                    className="spotify-pill-lyric pill-lyric-entering"
                                    key={displayedLyric.text}
                                >
                                    <span
                                        className="pill-lyric-text"
                                        style={{ fontSize: `${displayedLyric.fontSize}px` }}
                                    >
                                        {displayedLyric.text}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        // Empty spacer keeps pill-right pushed to the right
                        // edge when the lyric isn't being displayed.
                        <div className="spotify-pill-spacer" aria-hidden="true" />
                    )}
                    <div className="spotify-pill-right">
                        <button className="spotify-pill-btn play-btn" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                            {isPaused ? <PlayIcon size={10} /> : <PauseIcon size={10} />}
                        </button>
                        <button className="spotify-pill-btn next-btn" onClick={nextSong} title="Next Song" aria-label="Next">
                            <NextIcon size={12} />
                        </button>
                        <div className="spotify-pill-viz" aria-hidden="true">
                            {ULTRA_BAR_INDICES.map((idx, i) => (
                                <span
                                    key={i}
                                    className="viz-bar"
                                    style={{ height: `${Math.max(6, (bars[idx] ?? 0.05) * 36)}px`, animationDelay: `${i * 0.04}s`, background: vibrantBarColor }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>,
        );
    }

    if (isLoading) {
        const isHorizontal = activeHeight < 220;
        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel pip-mode ${isVisible ? '' : 'hidden'} mode-${playerMode} ${isHorizontal ? 'layout-horizontal' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="lyrics-loading">
                    <div className="loading-visual" aria-hidden="true">
                        <span className="loading-ring loading-ring-one" />
                        <span className="loading-ring loading-ring-two" />
                        <span className="loading-dot" />
                    </div>
                    <div className="loading-text">Finding lyrics</div>
                    <div className="loading-subtext">{currentTitle || 'Listening for the current song'}</div>
                    <div className="loading-bars" aria-hidden="true">
                        <span /><span /><span /><span />
                    </div>
                </div>
            </div>,
        );
    }

    if (lines.length === 0) {
        const isHorizontal = activeHeight < 220;
        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel pip-mode ${isVisible ? '' : 'hidden'} mode-${playerMode} ${isHorizontal ? 'layout-horizontal' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="no-lyrics">
                    <div className="no-lyrics-icon" aria-hidden="true" />
                    <div className="no-lyrics-text">{error || 'No lyrics available for this video'}</div>
                    <button className="retry-btn" onClick={refetch}>Try again</button>
                    <form className="manual-search" onSubmit={handleManualSearch}>
                        <input
                            value={manualTrack}
                            onChange={(e) => setManualTrack(e.target.value)}
                            placeholder="Song name"
                            aria-label="Song name"
                        />
                        <input
                            value={manualArtist}
                            onChange={(e) => setManualArtist(e.target.value)}
                            placeholder="Artist optional"
                            aria-label="Artist (optional)"
                        />
                        <button type="submit" disabled={!manualTrack.trim()}>Search lyrics</button>
                    </form>
                </div>
            </div>,
        );
    }

    // Full mode
    const isHorizontal = activeHeight < 220;
    const panelContent = (
        <div
            ref={panelRef}
            className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''} mode-${playerMode} ${isHorizontal ? 'layout-horizontal' : ''} ${dockCollapsed ? 'dock-collapsed' : ''}`}
            style={panelStyle}
            onMouseDown={!isPipMode ? handleDragStart : undefined}
        >
            {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
            {!isPipMode && (
                <div className="drag-handle">
                    <span className="drag-indicator">{'\u22ee\u22ee'}</span>
                </div>
            )}

            <div className="source-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        className="source-btn download-btn"
                        onClick={handleDownload}
                        title="Download .lrc (saves with offset)"
                        style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}
                    >
                        <DownloadIcon size={14} />
                    </button>
                    {source === 'local' && (
                        <button
                            className="source-btn delete-btn"
                            onClick={handleDeleteLocal}
                            title="Delete saved lyrics"
                            style={{ background: 'rgba(255,80,80,0.15)', borderColor: 'rgba(255,80,80,0.3)', height: '26px', padding: '0 8px' }}
                        >
                            Del
                        </button>
                    )}
                    <button
                        className="source-btn"
                        onClick={() => setIsSearchVisible((v) => !v)}
                        title="Manual search"
                        style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}
                    >
                        <SearchIcon size={14} />
                    </button>
                </div>

                <div className="source-buttons">
                    <span
                        className="source-name"
                        style={{ display: 'flex', alignItems: 'center', height: '26px', boxSizing: 'border-box' }}
                    >
                        {source === 'local' && 'Local (Saved)'}
                        {source === 'youtube' && 'YouTube'}
                        {source === 'lrclib' && 'LRCLIB'}
                    </span>
                    {hasMoreResults && (
                        <button
                            className="source-btn next-btn"
                            onClick={tryNextResult}
                            title="Try next lyrics result"
                            style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}
                        >
                            <RefreshIcon size={14} />
                        </button>
                    )}
                    <button
                        className="source-btn pip-btn"
                        onClick={isPipMode ? onClosePip : onOpenPip}
                        title={isPipMode ? 'Pop In (return to page)' : 'Pop Out (floating window)'}
                        style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}
                    >
                        {isPipMode ? '\u2193' : '\u2191'}
                    </button>
                </div>
            </div>

            {isSearchVisible && (
                <div
                    style={{
                        position: 'absolute',
                        top: '56px',
                        left: 0,
                        right: 0,
                        zIndex: 6,
                        padding: '6px 12px',
                        background: 'rgba(0,0,0,0.35)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <form
                        className="manual-search"
                        onSubmit={(e) => {
                            handleManualSearch(e);
                            setIsSearchVisible(false);
                        }}
                        style={{ flexDirection: 'row', gap: '6px', marginTop: 0 }}
                    >
                        <input value={manualTrack} onChange={(e) => setManualTrack(e.target.value)} placeholder="Song name" aria-label="Song name" style={{ flex: 1 }} />
                        <input value={manualArtist} onChange={(e) => setManualArtist(e.target.value)} placeholder="Artist" aria-label="Artist" style={{ flex: 1 }} />
                        <button type="submit" disabled={!manualTrack.trim()}>Go</button>
                    </form>
                </div>
            )}

            <div className="offset-controls">
                <button className="offset-btn" onClick={() => adjustOffset(-5)} title="-5s">-5</button>
                <button className="offset-btn" onClick={() => adjustOffset(-1)} title="-1s">-1</button>
                <button className="offset-btn" onClick={() => adjustOffset(-0.2)} title="-0.2s">-.2</button>
                <button className="offset-value" onClick={resetOffset} title="Reset">
                    {offset >= 0 ? '+' : ''}{offset.toFixed(1)}s
                </button>
                <button className="offset-btn" onClick={() => adjustOffset(0.2)} title="+0.2s">+.2</button>
                <button className="offset-btn" onClick={() => adjustOffset(1)} title="+1s">+1</button>
                <button className="offset-btn" onClick={() => adjustOffset(5)} title="+5s">+5</button>
            </div>

            <div ref={scrollRef} className="streamlyrics-scroll-container">
                {lines.map((line, index) => (
                    <div
                        key={`${line.start}-${index}`}
                        ref={(el) => {
                            lineRefs.current[index] = el;
                        }}
                    >
                        <LyricLineComponent
                            text={line.text}
                            isActive={index === currentLineIndex}
                            isPast={index < currentLineIndex}
                            onClick={() => handleLineClick(index)}
                        />
                    </div>
                ))}

                {isInstrumental() && (
                    <div className="instrumental-break">{'\u266a'} Instrumental {'\u266a'}</div>
                )}
            </div>

            <div className={`player-dock ${dockCollapsed ? 'collapsed' : ''}`}>
                {!dockCollapsed && (
                <button
                    className="player-dock-close"
                    onClick={toggleDock}
                    title="Hide player"
                    aria-label="Hide player"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                )}
                <div className="visualizer" aria-hidden="true">
                    {bars.map((h, i) => (
                        <span
                            key={i}
                            className="viz-bar"
                            style={{ height: `${Math.max(3, h * (dockCollapsed ? 14 : 28))}px`, animationDelay: `${i * 0.04}s` }}
                        />
                    ))}
                </div>

                {!dockCollapsed && (<>
                <div className="metadata-cockpit">
                    <div className="thumbnail-container">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt="Album Art" className="album-art" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={56} active={isVisible} />
                        )}
                    </div>
                    <div className="track-info">
                        <div className="track-title" title={cleanTrack}>{cleanTrack || currentTitle || 'No title'}</div>
                        <div className="track-artist" title={cleanArtist}>{cleanArtist || 'Unknown artist'}</div>
                    </div>
                </div>

                <div className="player-controls">
                    <button className="player-btn player-btn-prev" onClick={prevSong} title="Previous song" aria-label="Previous">
                        <PrevIcon />
                    </button>
                    <button className="player-btn player-btn-rewind" onClick={() => skipVideo(-5)} title="Rewind 5s" aria-label="Rewind">
                        <RewindIcon />
                    </button>
                    <button className="player-btn player-btn-play" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                        {isPaused ? <PlayIcon size={22} /> : <PauseIcon size={22} />}
                    </button>
                    <button className="player-btn player-btn-forward" onClick={() => skipVideo(5)} title="Forward 5s" aria-label="Forward">
                        <FastForwardIcon />
                    </button>
                    <button className="player-btn player-btn-next" onClick={nextSong} title="Next song" aria-label="Next">
                        <NextIcon />
                    </button>
                    <button className="player-btn player-btn-expand" onClick={handleExpand} title="Expand to Full Player" aria-label="Expand">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    </button>
                </div>
                </>)}
            </div>

            {dockCollapsed && (
                <button
                    className="player-dock-show"
                    onClick={toggleDock}
                    title="Show player"
                    aria-label="Show player"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="18 15 12 9 6 15" />
                    </svg>
                </button>
            )}
        </div>
    );

    return renderPanel(panelContent);
};

const ResizeHandles: React.FC<{
    onResizeStart: (dir: string) => (e: React.MouseEvent) => void;
}> = ({ onResizeStart }) => (
    <>
        <div className="resize-handle resize-n" onMouseDown={onResizeStart('n')} />
        <div className="resize-handle resize-s" onMouseDown={onResizeStart('s')} />
        <div className="resize-handle resize-e" onMouseDown={onResizeStart('e')} />
        <div className="resize-handle resize-w" onMouseDown={onResizeStart('w')} />
        <div className="resize-handle resize-nw" onMouseDown={onResizeStart('nw')} />
        <div className="resize-handle resize-ne" onMouseDown={onResizeStart('ne')} />
        <div className="resize-handle resize-sw" onMouseDown={onResizeStart('sw')} />
        <div className="resize-handle resize-se" onMouseDown={onResizeStart('se')} />
    </>
);
