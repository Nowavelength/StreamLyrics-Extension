import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LyricLine as LyricLineComponent } from './LyricLine';
import { useVideoSync } from '../hooks/useVideoSync';
import { useTranscript } from '../hooks/useTranscript';
import { useThemeColors } from '../hooks/useThemeColors';
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
    MonitorIcon,
    PopInIcon,
    TrashIcon,
} from './icons';
import { storageService } from '../services/storageService';
import {
    cleanVideoTitle,
    getCurrentTrackInfo,
    getLyricsSearchTitle,
    getVideoId,
} from '../utils/transcriptParser';
import { getThumbnailUrl, getHighResThumbnailUrl, darken } from '../utils/colorExtractor';
import { AbstractThumbnail } from './AbstractThumbnail';
import { NormalVisualizer, MiniVisualizer, UltraVisualizer } from './Visualizers';
import { VerticalScrollProgress, HorizontalSeekBar } from './ProgressBars';
import { Settings } from '../hooks/useSettings';

/** White-ish color used for all visualizer bars (matches the approved design). */
const VIZ_COLOR = 'rgba(255, 255, 255, 0.92)';

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
const MIN_ULTRA_WIDTH = 332;
const MAX_WIDTH = 700;
const MIN_HEIGHT = 48;
const MAX_HEIGHT = 800;

const THRESHOLD_ULTRA_ENTER_HEIGHT = 105;
const THRESHOLD_ULTRA_EXIT_HEIGHT = 125;
const THRESHOLD_MINI_ENTER_AREA = 155_000;
const THRESHOLD_MINI_EXIT_AREA = 175_000;

// chrome.storage.local key for panel layout persistence.
const LAYOUT_STORAGE_KEY = 'streamlyrics_panel_layout';

interface PersistedLayout {
    width: number;
    height: number;
    x: number;
    y: number;
    /** Whether the Normal-mode control dock (album art + transport) is shown. */
    controlsOpen?: boolean;
}

const DEFAULT_LAYOUT: PersistedLayout = {
    width: 380,
    height: 500,
    x: Math.max(20, window.innerWidth - 400),
    y: 80,
    controlsOpen: false,
};

export type PlayerMode = 'full' | 'mini' | 'ultra';

// ---------- Small SVG helpers (unchanged) --------------------------------
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
        const height = clamp(stored.height ?? DEFAULT_LAYOUT.height, MIN_HEIGHT, MAX_HEIGHT);
        return {
            width: clamp(stored.width ?? settingsWidth, getMinWidthForHeight(height), MAX_WIDTH),
            height,
            x: clamp(stored.x ?? DEFAULT_LAYOUT.x, 0, Math.max(0, window.innerWidth - 100)),
            y: clamp(stored.y ?? DEFAULT_LAYOUT.y, 0, Math.max(0, window.innerHeight - 100)),
            controlsOpen: stored.controlsOpen ?? false,
        };
    } catch {
        return { ...DEFAULT_LAYOUT, width: settingsWidth };
    }
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function getMinWidthForHeight(height: number) {
    return height <= THRESHOLD_ULTRA_EXIT_HEIGHT ? MIN_ULTRA_WIDTH : MIN_WIDTH;
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
    const [controlsOpen, setControlsOpen] = useState(false);

    // Hydrate persisted layout once on mount.
    useEffect(() => {
        let cancelled = false;
        loadPersistedLayout(settings?.panelWidth ?? DEFAULT_LAYOUT.width).then((layout) => {
            if (cancelled) return;
            setPanelWidth(layout.width);
            setPanelHeight(layout.height);
            setPanelX(layout.x);
            setPanelY(layout.y);
            setControlsOpen(layout.controlsOpen ?? false);
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
    const [highResThumbnailUrl, setHighResThumbnailUrl] = useState<string | null>(null);

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
        duration,
        offset,
        seekTo,
        adjustOffset,
        resetOffset,
        togglePlayPause,
        setLineIndex,
    } = useVideoSync(lines, initialOffset);
    const { dominant: backgroundColor, dark: darkColor } = useThemeColors(thumbnailUrl);
    const progressFill = useMemo(() => darken(backgroundColor, 0.45), [backgroundColor]);
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
        let normalUrl: string | null = null;

        const ytMusicThumb = document.querySelector(
            'ytmusic-player-bar img.image',
        ) as HTMLImageElement | null;
        if (ytMusicThumb?.src) {
            normalUrl = ytMusicThumb.src;
        } else {
            const ytMusicArt = document.querySelector(
                '.ytmusic-player img',
            ) as HTMLImageElement | null;
            if (ytMusicArt?.src) {
                normalUrl = ytMusicArt.src;
            } else {
                const videoId = getVideoId();
                if (videoId) {
                    normalUrl = getThumbnailUrl(videoId);
                }
            }
        }

        if (normalUrl) {
            setThumbnailUrl(normalUrl);
            setHighResThumbnailUrl(getHighResThumbnailUrl(normalUrl));
        } else {
            setThumbnailUrl(null);
            setHighResThumbnailUrl(null);
        }
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
            ? 14
            : currentLineText.length > 25
              ? 16
              : 19;

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
                controlsOpen,
                ...next,
            };
            chrome.storage.local.set({ [LAYOUT_STORAGE_KEY]: layout });
        },
        [panelWidth, panelHeight, panelX, panelY, controlsOpen],
    );

    const toggleControls = useCallback(() => {
        setControlsOpen((prev) => {
            const next = !prev;
            persistLayout({ controlsOpen: next });
            return next;
        });
    }, [persistLayout]);

    // ---------- Player controls -----------------------------------------
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
                    '.resize-handle, .offset-btn, .source-btn, .lyric-line, .manual-search, .retry-btn, .player-btn, .spotify-btn, .spotify-pill-btn, .spotify-close-dot, .sl-hbtn, .sl-offset-btn, .sl-ctrl-toggle, .sl-transport-btn, .sl-vscroll, .sl-hseek, .sl-mode-btn',
                )
            ) {
                return;
            }
            if (playerMode === 'full' && target.closest('.sl-control-dock')) return;

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
                const enforceWidthForHeight = (height: number) => {
                    const minWidth = getMinWidthForHeight(height);
                    if (panelWidth < minWidth) {
                        setPanelWidth(minWidth);
                        setPanelX(clamp(panelX, 0, Math.max(0, window.innerWidth - minWidth)));
                    }
                };

                if (isResizing.includes('e')) {
                    const max = Math.min(MAX_WIDTH, window.innerWidth - panelX);
                    setPanelWidth(clamp(e.clientX - panelX, getMinWidthForHeight(panelHeight), max));
                }
                if (isResizing.includes('w')) {
                    const newWidth = panelX + panelWidth - e.clientX;
                    const clampedWidth = clamp(newWidth, getMinWidthForHeight(panelHeight), MAX_WIDTH);
                    const nextX = panelX + panelWidth - clampedWidth;
                    if (nextX >= 0) {
                        setPanelX(nextX);
                        setPanelWidth(clampedWidth);
                    }
                }
                if (isResizing.includes('s')) {
                    const max = Math.min(MAX_HEIGHT, window.innerHeight - panelY);
                    const nextHeight = clamp(e.clientY - panelY, MIN_HEIGHT, max);
                    setPanelHeight(nextHeight);
                    enforceWidthForHeight(nextHeight);
                }
                if (isResizing.includes('n')) {
                    const newHeight = panelY + panelHeight - e.clientY;
                    if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT && e.clientY >= 0) {
                        setPanelY(e.clientY);
                        setPanelHeight(newHeight);
                        enforceWidthForHeight(newHeight);
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
    const modeBg =
        playerMode === 'full' ? backgroundColor : playerMode === 'mini' ? darkColor : '#000000';
    const panelStyle: React.CSSProperties = isPipMode
        ? {
              backgroundColor: modeBg,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              ['--lyric-font-size' as any]: `${settings.fontSize}px`,
          }
        : {
              backgroundColor: modeBg,
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
        const activeThumbnail = highResThumbnailUrl || thumbnailUrl;
        const miniNarrow = activeWidth < 300;
        const miniLyricText = currentLineText || (isInstrumental() ? 'Instrumental' : '');

        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} mode-mini ${miniNarrow ? 'mini-narrow' : ''} ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="sl-mini">
                    <div className="sl-mini-art">
                        {activeThumbnail ? (
                            <img src={activeThumbnail} alt="Album Art" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={160} active={isVisible} />
                        )}
                    </div>

                    <div className="sl-mini-meta">
                        <div className="sl-mini-title" title={titleText}>{titleText}</div>
                        <div className="sl-mini-artist" title={artistText}>{artistText}</div>
                    </div>

                    <div className="sl-mini-transport">
                        <button className="sl-transport-btn" onClick={prevSong} title="Previous Song" aria-label="Previous">
                            <PrevIcon size={16} />
                        </button>
                        <button className="sl-transport-btn mini-skip" onClick={() => skipVideo(-5)} title="Rewind 5s" aria-label="Rewind 5 seconds">
                            <RewindIcon size={16} />
                        </button>
                        <button className="sl-transport-btn play" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                            {isPaused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}
                        </button>
                        <button className="sl-transport-btn mini-skip" onClick={() => skipVideo(5)} title="Forward 5s" aria-label="Forward 5 seconds">
                            <FastForwardIcon size={16} />
                        </button>
                        <button className="sl-transport-btn" onClick={nextSong} title="Next Song" aria-label="Next">
                            <NextIcon size={16} />
                        </button>
                    </div>

                    {!miniNarrow && (
                        <div className="sl-mini-viz-box">
                            <MiniVisualizer bars={bars} color={VIZ_COLOR} />
                        </div>
                    )}

                    <div className="sl-mini-lyric" aria-live="polite">
                        <span className="sl-mini-lyric-text">{miniLyricText}</span>
                    </div>
                </div>
            </div>,
        );
    }

    if (playerMode === 'ultra') {
        const titleText = cleanTrack || currentTitle || 'No title';
        const artistText = cleanArtist || 'Unknown artist';
        const tooltipText = artistText ? `${titleText} — ${artistText}` : titleText;
        const ultraShowViz = activeWidth >= 440;
        const ultraShowLyric = activeWidth >= 380;

        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} mode-ultra ${ultraShowViz ? '' : 'ultra-narrow'} ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="sl-ultra">
                    <div className="sl-ultra-art" title={tooltipText}>
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt={tooltipText} draggable="false" />
                        ) : (
                            <AbstractThumbnail size={44} active={isVisible} />
                        )}
                    </div>

                    {ultraShowLyric ? (
                        <div className="sl-ultra-lyric-stack" aria-live="polite">
                            {previousLyric && previousLyric.text && (
                                <div className="sl-ultra-lyric pill-lyric-leaving">
                                    <span className="sl-ultra-lyric-text" style={{ fontSize: `${previousLyric.fontSize}px` }}>
                                        {previousLyric.text}
                                    </span>
                                </div>
                            )}
                            {displayedLyric.text && (
                                <div className="sl-ultra-lyric pill-lyric-entering" key={displayedLyric.text}>
                                    <span className="sl-ultra-lyric-text" style={{ fontSize: `${displayedLyric.fontSize}px` }}>
                                        {displayedLyric.text}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="sl-ultra-spacer" aria-hidden="true" />
                    )}

                    <div className="sl-ultra-controls">
                        {hasMoreResults && (
                            <button className="sl-transport-btn small" onClick={tryNextResult} title="Try next lyrics result" aria-label="Next lyrics result">
                                <RefreshIcon size={12} />
                            </button>
                        )}
                        <button className="sl-transport-btn" onClick={prevSong} title="Previous Song" aria-label="Previous">
                            <PrevIcon size={15} />
                        </button>
                        <button className="sl-transport-btn play" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                            {isPaused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
                        </button>
                        <button className="sl-transport-btn" onClick={nextSong} title="Next Song" aria-label="Next">
                            <NextIcon size={15} />
                        </button>
                    </div>

                    {ultraShowViz && (
                        <div className="sl-ultra-viz-box">
                            <UltraVisualizer bars={bars} color={VIZ_COLOR} />
                        </div>
                    )}
                </div>

                <HorizontalSeekBar
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={seekTo}
                    fillColor={progressFill}
                />
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
            className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''} mode-${playerMode} ${isHorizontal ? 'layout-horizontal' : ''} ${controlsOpen ? 'controls-open' : ''}`}
            style={panelStyle}
            onMouseDown={!isPipMode ? handleDragStart : undefined}
        >
            {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}

            <div className="sl-header">
                <div className="sl-header-group">
                    <button
                        className="sl-hbtn"
                        onClick={handleDownload}
                        title="Download .lrc (saves with offset)"
                        aria-label="Download lyrics"
                    >
                        <DownloadIcon size={18} />
                    </button>
                    <button
                        className="sl-hbtn"
                        onClick={() => setIsSearchVisible((v) => !v)}
                        title="Manual search"
                        aria-label="Manual search"
                    >
                        <SearchIcon size={18} />
                    </button>
                    {source === 'local' && (
                        <button
                            className="sl-hbtn danger"
                            onClick={handleDeleteLocal}
                            title="Delete saved lyrics"
                            aria-label="Delete saved lyrics"
                        >
                            <TrashIcon size={18} />
                        </button>
                    )}
                </div>
                <div className="sl-header-group">
                    {hasMoreResults && (
                        <button
                            className="sl-hbtn"
                            onClick={tryNextResult}
                            title="Try next lyrics result"
                            aria-label="Next lyrics result"
                        >
                            <RefreshIcon size={18} />
                        </button>
                    )}
                    <button
                        className="sl-hbtn"
                        onClick={isPipMode ? onClosePip : onOpenPip}
                        title={isPipMode ? 'Pop In (return to page)' : 'Pop Out (floating window)'}
                        aria-label="Toggle pop-out window"
                    >
                        {isPipMode ? <PopInIcon size={18} /> : <MonitorIcon size={18} />}
                    </button>
                </div>
            </div>

            {isSearchVisible && (
                <div
                    style={{
                        position: 'absolute',
                        top: '96px',
                        left: 0,
                        right: 0,
                        zIndex: 8,
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

            <div className="sl-offsets">
                <button className="sl-offset-btn" onClick={() => adjustOffset(-5)} title="-5s">-5</button>
                <button className="sl-offset-btn" onClick={() => adjustOffset(-1)} title="-1s">-1</button>
                <button className="sl-offset-btn" onClick={() => adjustOffset(-0.2)} title="-0.2s">-0.2</button>
                <button className="sl-offset-btn reset" onClick={resetOffset} title="Reset offset">
                    {offset === 0 ? 'Reset' : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`}
                </button>
                <button className="sl-offset-btn" onClick={() => adjustOffset(0.2)} title="+0.2s">+0.2</button>
                <button className="sl-offset-btn" onClick={() => adjustOffset(1)} title="+1s">+1</button>
                <button className="sl-offset-btn" onClick={() => adjustOffset(5)} title="+5s">+5</button>
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

            <VerticalScrollProgress
                scrollRef={scrollRef}
                fillColor={progressFill}
                syncKey={currentLineIndex}
            />

            <div className={`sl-bottom ${controlsOpen ? 'controls-open' : ''}`}>
                <div className="sl-control-dock">
                    <div className="sl-dock-art">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt="Album Art" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={96} active={isVisible} />
                        )}
                    </div>
                    <div className="sl-dock-meta">
                        <div className="sl-dock-title" title={cleanTrack}>{cleanTrack || currentTitle || 'No title'}</div>
                        <div className="sl-dock-artist" title={cleanArtist}>{cleanArtist || 'Unknown artist'}</div>
                    </div>
                    <div className="sl-dock-transport">
                        <button className="sl-transport-btn" onClick={prevSong} title="Previous song" aria-label="Previous">
                            <PrevIcon size={18} />
                        </button>
                        <button className="sl-transport-btn" onClick={() => skipVideo(-5)} title="Rewind 5s" aria-label="Rewind">
                            <RewindIcon size={18} />
                        </button>
                        <button className="sl-transport-btn play" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                            {isPaused ? <PlayIcon size={22} /> : <PauseIcon size={22} />}
                        </button>
                        <button className="sl-transport-btn" onClick={() => skipVideo(5)} title="Forward 5s" aria-label="Forward">
                            <FastForwardIcon size={18} />
                        </button>
                        <button className="sl-transport-btn" onClick={nextSong} title="Next song" aria-label="Next">
                            <NextIcon size={18} />
                        </button>
                    </div>
                </div>

                <div className="sl-bottom-row">
                    <NormalVisualizer bars={bars} color={VIZ_COLOR} expanded={controlsOpen} />
                    <button
                        className="sl-ctrl-toggle"
                        onClick={toggleControls}
                        title={controlsOpen ? 'Hide controls' : 'Show controls'}
                        aria-label="Toggle player controls"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points={controlsOpen ? '6 9 12 15 18 9' : '6 15 12 9 18 15'} />
                        </svg>
                    </button>
                </div>
            </div>
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
