import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LyricLine as LyricLineComponent } from './LyricLine';
import { useVideoSync } from '../hooks/useVideoSync';
import { useTranscript } from '../hooks/useTranscript';
import { useDominantColor } from '../hooks/useDominantColor';
import { useAudioBars } from '../hooks/useAudioBars';
import { PrevIcon, NextIcon, PlayIcon, PauseIcon, RewindIcon, FastForwardIcon, SearchIcon, DownloadIcon, RefreshIcon } from './icons';
import { LyricsSource } from '../services/transcriptService';
import { storageService } from '../services/storageService';
import { cleanVideoTitle, getCurrentTrackInfo, getLyricsSearchTitle, getVideoId } from '../utils/transcriptParser';
import { getThumbnailUrl } from '../utils/colorExtractor';
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
const MIN_WIDTH = 180;
const MAX_WIDTH = 700;
const MIN_HEIGHT = 48;
const MAX_HEIGHT = 800;

// Sizing Area & Height thresholds for fluid adaptive stages
const THRESHOLD_ULTRA_ENTER_HEIGHT = 80; // Height-only trigger for Mini Player (capsule pill - ultra)
const THRESHOLD_ULTRA_EXIT_HEIGHT = 100;

// In-between Player (square card - mini) thresholds
const THRESHOLD_MINI_ENTER_AREA = 135000; // Fluid composite area trigger
const THRESHOLD_MINI_EXIT_AREA = 155000;

export type PlayerMode = 'full' | 'mini' | 'ultra';

// Spotify custom SVG and icon helper components
const GripGrid2x4: React.FC = () => (
    <svg width="12" height="6" viewBox="0 0 12 6" fill="currentColor" style={{ opacity: 0.4, display: 'block' }}>
        <circle cx="1" cy="1" r="1" />
        <circle cx="4" cy="1" r="1" />
        <circle cx="7" cy="1" r="1" />
        <circle cx="10" cy="1" r="1" />
        <circle cx="1" cy="5" r="1" />
        <circle cx="4" cy="5" r="1" />
        <circle cx="7" cy="5" r="1" />
        <circle cx="10" cy="5" r="1" />
    </svg>
);

const GripGrid2x3: React.FC = () => (
    <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor" style={{ opacity: 0.4, display: 'block' }}>
        <circle cx="1" cy="2" r="1" />
        <circle cx="1" cy="5" r="1" />
        <circle cx="1" cy="8" r="1" />
        <circle cx="5" cy="2" r="1" />
        <circle cx="5" cy="5" r="1" />
        <circle cx="5" cy="8" r="1" />
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

// Hysteresis transition solver - based on available area / usable space and height-only mini trigger
export const getNextPlayerMode = (width: number, height: number, currentMode: PlayerMode): PlayerMode => {
    const area = width * height;
    
    // 1. Ultra (Capsule Pill / Mini Player) - PURELY HEIGHT-BASED
    const shouldBeUltra = height <= (currentMode === 'ultra' ? THRESHOLD_ULTRA_EXIT_HEIGHT : THRESHOLD_ULTRA_ENTER_HEIGHT);
    
    if (shouldBeUltra) {
        return 'ultra';
    }
    
    // 2. Mini (Square Card / In-between Player) - STRICTLY AREA-BASED
    const shouldBeMini = area <= THRESHOLD_MINI_ENTER_AREA;
    
    if (currentMode === 'ultra') {
        // We are exiting ultra (height > THRESHOLD_ULTRA_EXIT_HEIGHT).
        // Determine whether to go to mini or full based on area/usable space.
        return shouldBeMini ? 'mini' : 'full';
    }
    
    if (currentMode === 'mini') {
        // We are in mini mode. We stay in mini unless area allows us to exit.
        const canExitMini = area > THRESHOLD_MINI_EXIT_AREA;
        if (!canExitMini) {
            return 'mini';
        }
        return 'full';
    }
    
    // We are in full mode. Check if we should enter mini.
    if (shouldBeMini) {
        return 'mini';
    }
    
    return 'full';
};


/**
 * Main lyrics panel component - PIP-style (draggable + resizable)
 * Can render in-page or in a floating PIP window
 */
export const Panel: React.FC<PanelProps> = ({ isVisible, isPipMode, pipWindow, onOpenPip, onClosePip, settings }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
    const panelRef = useRef<HTMLDivElement>(null);

    // Panel dimensions and position
    const [panelWidth, setPanelWidth] = useState(settings?.panelWidth ?? 380);
    const [panelHeight, setPanelHeight] = useState(500);
    const [panelX, setPanelX] = useState(() => {
        const desired = window.innerWidth - 400;
        // Clamp to safe range so the panel never spawns off-screen even when
        // the window is narrower than 400px (or innerWidth is 0 in odd contexts).
        return Math.max(0, Math.min(desired, Math.max(0, window.innerWidth - 200)));
    });
    const [panelY, setPanelY] = useState(80);

    // Interaction states
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Sync settings panel width reactively only when the storage value actually changes from outside
    const lastStoredWidth = useRef(settings?.panelWidth ?? 380);
    useEffect(() => {
        if (settings?.panelWidth && settings.panelWidth !== lastStoredWidth.current) {
            lastStoredWidth.current = settings.panelWidth;
            setPanelWidth(settings.panelWidth);
        }
    }, [settings?.panelWidth]);

    // Track width/height reactively for both in-page and Picture-in-Picture resizing
    const [pipWidth, setPipWidth] = useState(window.innerWidth);
    const [pipHeight, setPipHeight] = useState(window.innerHeight);

    const activeWidth = isPipMode ? pipWidth : panelWidth;
    const activeHeight = isPipMode ? pipHeight : panelHeight;

    const [playerMode, setPlayerMode] = useState<PlayerMode>(() => getNextPlayerMode(activeWidth, activeHeight, 'full'));

    useEffect(() => {
        if (!isPipMode || !pipWindow) return;
        setPipWidth(pipWindow.innerWidth);
        setPipHeight(pipWindow.innerHeight);

        const handlePipResize = () => {
            setPipWidth(pipWindow.innerWidth);
            setPipHeight(pipWindow.innerHeight);
        };
        pipWindow.addEventListener('resize', handlePipResize);
        return () => {
            pipWindow.removeEventListener('resize', handlePipResize);
        };
    }, [isPipMode, pipWindow]);

    useEffect(() => {
        setPlayerMode(prev => {
            return getNextPlayerMode(activeWidth, activeHeight, prev);
        });
    }, [activeWidth, activeHeight]);

    // Zero-polling metadata and artwork single-trigger tracker
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

    const { lines, isLoading, error, source, currentTitle, refetch, searchManual, switchSource, tryNextResult, hasMoreResults } = useTranscript();
    const { currentLineIndex, isPaused, currentTime, offset, seekTo, adjustOffset, setOffsetExact, resetOffset, togglePlayPause } = useVideoSync(lines);
    const backgroundColor = useDominantColor(thumbnailUrl);
    const bars = useAudioBars(32);
    const [manualArtist, setManualArtist] = useState('');
    const [manualTrack, setManualTrack] = useState('');
    const [isSearchVisible, setIsSearchVisible] = useState(false);

    // Tracks whether the user is actively tuning offset (scroll/drag/click on
    // buttons, or a recent shift-click anchor). Drives the visibility of the
    // direction hint, the audio-position marker glow, and any other
    // adjustment-only UI. Cleared 1.5s after the last interaction.
    const [isAdjusting, setIsAdjusting] = useState(false);
    const adjustingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flagAdjusting = useCallback(() => {
        setIsAdjusting(true);
        if (adjustingTimerRef.current) clearTimeout(adjustingTimerRef.current);
        adjustingTimerRef.current = setTimeout(() => setIsAdjusting(false), 1500);
    }, []);
    useEffect(() => () => {
        if (adjustingTimerRef.current) clearTimeout(adjustingTimerRef.current);
    }, []);

    const offsetValueRef = useRef<HTMLButtonElement>(null);
    const audioMarkerRef = useRef<HTMLDivElement>(null);

    // 90/10 Spring-like mathematical dimension smoothing
    const [smoothWidth, setSmoothWidth] = useState(activeWidth);
    const [smoothHeight, setSmoothHeight] = useState(activeHeight);

    useEffect(() => {
        let rafId: number;
        const step = () => {
            setSmoothWidth((prev: number) => {
                const diff = activeWidth - prev;
                if (Math.abs(diff) < 0.1) return activeWidth;
                return prev + diff * 0.1;
            });
            setSmoothHeight((prev: number) => {
                const diff = activeHeight - prev;
                if (Math.abs(diff) < 0.1) return activeHeight;
                return prev + diff * 0.1;
            });
            rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafId);
    }, [activeWidth, activeHeight]);

    const updateThumbnailUrl = useCallback(() => {
        const ytMusicThumb = document.querySelector('ytmusic-player-bar img.image') as HTMLImageElement;
        if (ytMusicThumb?.src) {
            setThumbnailUrl(ytMusicThumb.src);
            return;
        }

        const ytMusicArt = document.querySelector('.ytmusic-player img') as HTMLImageElement;
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
        const timer1 = setTimeout(updateThumbnailUrl, 500);
        const timer2 = setTimeout(updateThumbnailUrl, 1500);
        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, [currentTitle, isLoading, updateThumbnailUrl]);

    // Cleaned track details
    const videoTitle = getLyricsSearchTitle(getCurrentTrackInfo());
    const { artist: cleanArtist, track: cleanTrack } = cleanVideoTitle(currentTitle || videoTitle);

    // Dynamic width restore expander
    const handleExpand = useCallback(() => {
        setPanelWidth(380);
        setPanelHeight(500);
        setPlayerMode('full');
        if (isPipMode && pipWindow) {
            try {
                pipWindow.resizeTo(380, 500);
            } catch (e) {
                console.warn('[StreamLyrics] Failed to resize PiP window:', e);
            }
        }
    }, [isPipMode, pipWindow]);


    /** Skip video forward/backward by N seconds */
    const skipVideo = useCallback((delta: number) => {
        seekTo(Math.max(0, currentTime + delta));
    }, [currentTime, seekTo]);

    /** Click YouTube's previous track button */
    const prevSong = useCallback(() => {
        const btn = document.querySelector('.ytp-prev-button, ytmusic-player-bar .previous-button') as HTMLElement;
        if (btn) btn.click();
    }, []);

    /** Click YouTube's next track button */
    const nextSong = useCallback(() => {
        const btn = document.querySelector('.ytp-next-button, ytmusic-player-bar .next-button') as HTMLElement;
        if (btn) btn.click();
    }, []);

    /**
     * Start dragging the panel
     */
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // Prevent drag on resize handles and interactive buttons/inputs
        if (target.closest('.resize-handle, .offset-btn, .source-btn, .lyric-line, .manual-search, .retry-btn, .player-btn, .spotify-btn, .spotify-pill-btn, .spotify-close-dot')) return;
        
        // In full mode, don't allow dragging from player-dock
        if (playerMode === 'full' && target.closest('.player-dock')) return;

        e.preventDefault();
        setIsDragging(true);
        setDragOffset({ x: e.clientX - panelX, y: e.clientY - panelY });
    }, [panelX, panelY, playerMode]);

    /**
     * Start resizing from a corner/edge
     */
    const handleResizeStart = useCallback((direction: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(direction);
    }, []);

    /**
     * Handle mouse move for dragging and resizing
     */
    useEffect(() => {
        if (!isDragging && !isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                const newX = Math.max(0, Math.min(Math.max(0, window.innerWidth - panelWidth), e.clientX - dragOffset.x));
                const newY = Math.max(0, Math.min(Math.max(0, window.innerHeight - panelHeight), e.clientY - dragOffset.y));
                setPanelX(newX);
                setPanelY(newY);
            }

            if (isResizing) {
                const panel = panelRef.current;
                if (!panel) return;

                // Handle resizing based on direction with boundary clamping
                if (isResizing.includes('e')) {
                    const maxAllowedWidth = Math.min(MAX_WIDTH, window.innerWidth - panelX);
                    const newWidth = e.clientX - panelX;
                    setPanelWidth(Math.max(MIN_WIDTH, Math.min(maxAllowedWidth, newWidth)));
                }
                if (isResizing.includes('w')) {
                    const newWidth = panelX + panelWidth - e.clientX;
                    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH && e.clientX >= 0) {
                        setPanelX(e.clientX);
                        setPanelWidth(newWidth);
                    }
                }
                if (isResizing.includes('s')) {
                    const maxAllowedHeight = Math.min(MAX_HEIGHT, window.innerHeight - panelY);
                    const newHeight = e.clientY - panelY;
                    setPanelHeight(Math.max(MIN_HEIGHT, Math.min(maxAllowedHeight, newHeight)));
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

            // Sync resizing width back to chrome.storage
            if (playerMode === 'full' && typeof chrome !== 'undefined' && chrome.storage?.sync) {
                chrome.storage.sync.set({ panelWidth: panelWidth });
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, panelX, panelY, panelWidth, panelHeight, dragOffset, playerMode]);

    /**
     * Check if we're in an instrumental section
     */
    const isInstrumental = (): boolean => {
        if (currentLineIndex < 0 || currentLineIndex >= lines.length - 1) return false;
        const currentLine = lines[currentLineIndex];
        const nextLine = lines[currentLineIndex + 1];
        return nextLine && (nextLine.start - currentLine.start - currentLine.duration) > INSTRUMENTAL_GAP_THRESHOLD;
    };

    /**
     * Auto-scroll to keep current line visible
     */
    useEffect(() => {
        if (currentLineIndex < 0 || !scrollRef.current) return;

        const lineElement = lineRefs.current[currentLineIndex];
        if (!lineElement) return;

        const container = scrollRef.current;
        const containerHeight = container.clientHeight;
        const targetPosition = containerHeight * 0.3;

        const lineTop = lineElement.offsetTop;
        const scrollTarget = lineTop - targetPosition;

        container.scrollTo({
            top: scrollTarget,
            behavior: 'smooth',
        });
    }, [currentLineIndex]);

    /**
     * Karaoke fill: write the active line's playback progress (0–1) into a
     * CSS custom property on the line wrapper. The .lyric-active style uses
     * `background-clip: text` with a gradient driven by --progress to produce
     * an Apple Music-style left-to-right fill. Imperative DOM update so React
     * doesn't re-render every frame.
     */
    useEffect(() => {
        if (currentLineIndex < 0) return;
        const line = lines[currentLineIndex];
        if (!line || line.duration <= 0) return;
        const wrapper = lineRefs.current[currentLineIndex];
        if (!wrapper) return;
        const elapsed = currentTime + offset - line.start;
        const progress = Math.max(0, Math.min(1, elapsed / line.duration));
        wrapper.style.setProperty('--progress', String(progress));
    }, [currentTime, offset, currentLineIndex, lines]);

    /**
     * Position the audio-position marker (C13) — the "you are here" indicator
     * that points to where raw audio time falls in the lyric flow, ignoring
     * offset. When offset is zero, this lines up with the highlight; when
     * offset is non-zero, the gap visualises the misalignment.
     */
    useEffect(() => {
        const marker = audioMarkerRef.current;
        if (!marker || lines.length === 0) return;

        // Binary search on raw currentTime (no offset)
        let left = 0, right = lines.length - 1, rawIdx = -1;
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (lines[mid].start <= currentTime) { rawIdx = mid; left = mid + 1; }
            else { right = mid - 1; }
        }
        if (rawIdx < 0) {
            marker.style.opacity = '0';
            return;
        }
        const lineEl = lineRefs.current[rawIdx];
        if (!lineEl) return;
        // Position at the vertical centre of the raw-audio line
        const top = lineEl.offsetTop + lineEl.offsetHeight / 2;
        marker.style.top = `${top}px`;
        marker.style.opacity = '';
    }, [currentTime, lines]);

    // Compute next-line preview state every render (cheap; Panel already
    // re-renders on currentTime updates via useVideoSync)
    const nextLineIdx = currentLineIndex + 1;
    const nextLine = nextLineIdx >= 0 && nextLineIdx < lines.length ? lines[nextLineIdx] : null;
    const timeToNext = nextLine ? nextLine.start - (currentTime + offset) : 0;
    const showNextLine = nextLine !== null && timeToNext > 0 && timeToNext < 8;

    /**
     * Handle clicking on a lyric line.
     * Shift+click "anchors" the lyrics to the current playback time — i.e.
     * it sets the offset so this line becomes the active one right now,
     * which is the fastest way to fix a systematically-off LRC.
     * Plain click seeks the video to that line.
     */
    const handleLineClick = (index: number, e?: React.MouseEvent) => {
        if (!lines[index]) return;
        if (e?.shiftKey) {
            // adjustedTime = currentTime + offset; we want adjustedTime = lines[index].start
            const target = lines[index].start - currentTime;
            setOffsetExact(target);
            flagAdjusting();
            return;
        }
        const seekTime = Math.max(0, lines[index].start - offset);
        seekTo(seekTime);
    };

    /**
     * Mouse-down on the offset value pill. Distinguishes click vs drag —
     * a movement of >3px counts as a drag and continuously updates the
     * offset (~0.01s per pixel; Shift = 0.001s/pixel for frame-precise tuning).
     * A pure click without movement resets the offset to zero.
     */
    const handleOffsetMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startOffset = offset;
        let dragged = false;
        let lastTarget = startOffset;

        const onMove = (m: MouseEvent) => {
            const dx = m.clientX - startX;
            if (!dragged && Math.abs(dx) > 3) dragged = true;
            if (!dragged) return;
            const factor = m.shiftKey ? 0.001 : 0.01;
            const target = startOffset + dx * factor;
            const delta = target - lastTarget;
            if (Math.abs(delta) >= 0.01) {
                adjustOffset(delta);
                lastTarget = target;
                flagAdjusting();
            }
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!dragged) {
                resetOffset();
                flagAdjusting();
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [offset, adjustOffset, resetOffset, flagAdjusting]);

    /**
     * Wheel-on-offset-value: ±0.05s per notch by default,
     * Shift = ±0.5s (coarse), Ctrl/Cmd = ±0.01s (ultra-fine).
     * Attached imperatively because React's synthetic wheel listener is
     * passive in modern React, so e.preventDefault() inside an onWheel
     * handler is ignored.
     */
    useEffect(() => {
        const el = offsetValueRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            const step = e.shiftKey ? 0.5 : (e.ctrlKey || e.metaKey) ? 0.01 : 0.05;
            adjustOffset(e.deltaY < 0 ? step : -step);
            flagAdjusting();
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, [adjustOffset, flagAdjusting]);

    /** Wrap adjustOffset for the +/- buttons so they also flag adjustment */
    const stepOffset = useCallback((delta: number) => {
        adjustOffset(delta);
        flagAdjusting();
    }, [adjustOffset, flagAdjusting]);

    const handleManualSearch = (e: React.FormEvent) => {
        e.preventDefault();
        searchManual(manualArtist, manualTrack);
    };

    /**
     * Handle download lyrics as .lrc
     * Applies current offset to timestamps and saves as priority
     */
    const handleDownload = async () => {
        if (!lines || lines.length === 0) return;

        console.log('[Download] Current offset:', offset);
        console.log('[Download] Original first line start:', lines[0].start);

        // 1. Apply offset to all lines
        // NOTE: We SUBTRACT offset because positive offset means "show earlier"
        // Example: offset +3.2 means "show 3.2s earlier", so timestamp 10.0 becomes 6.8
        const adjustedLines = lines.map(line => ({
            ...line,
            start: Math.max(0, line.start - offset)
        }));

        console.log('[Download] Adjusted first line start:', adjustedLines[0].start);

        // 2. Generate LRC content
        const lrcContent = adjustedLines.map(line => {
            const minutes = Math.floor(line.start / 60);
            const seconds = Math.floor(line.start % 60);
            const ms = Math.floor((line.start % 1) * 100);
            const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}]`;
            return `${timestamp}${line.text}`;
        }).join('\n');

        console.log('[Download] First line of LRC:', lrcContent.split('\n')[0]);

        // 3. Trigger download
        const blob = new Blob([lrcContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const videoTitle = getLyricsSearchTitle(getCurrentTrackInfo());
        const { artist, track } = cleanVideoTitle(videoTitle);
        const filename = `${artist} - ${track}.lrc`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 4. Save to local storage as priority
        await storageService.saveLyrics(artist, track, adjustedLines);

        // 5. Force source switch to local (UI update)
        switchSource('local');

        // 6. Reset offset to 0 since saved lyrics already have offset baked in
        resetOffset();
    };

    /**
     * Handle delete local lyrics
     * Removes cached lyrics and refetches from API sources
     */
    const handleDeleteLocal = async () => {
        const videoTitle = getLyricsSearchTitle(getCurrentTrackInfo());
        const { artist, track } = cleanVideoTitle(videoTitle);

        if (!confirm(`Delete saved lyrics for "${track}" by ${artist}?`)) {
            return;
        }

        await storageService.deleteLyrics(artist, track);

        // Refetch lyrics from remaining sources without reloading the YT page
        // (which would lose the user's playback position).
        refetch();
    };

    const panelStyle = isPipMode ? {
        backgroundColor: playerMode === 'full' ? backgroundColor : '#121212',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        '--lyric-font-size': `${settings.fontSize}px`,
    } as React.CSSProperties : {
        backgroundColor: playerMode === 'full' ? backgroundColor : '#121212',
        width: `${smoothWidth}px`,
        height: `${smoothHeight}px`,
        left: `${panelX}px`,
        top: `${panelY}px`,
        right: 'auto',
        bottom: 'auto',
        position: 'fixed' as const,
        cursor: isDragging ? 'grabbing' : 'grab',
        '--lyric-font-size': `${settings.fontSize}px`,
    } as React.CSSProperties;

    const renderPanel = (content: React.ReactElement) => {
        if (isPipMode && pipWindow) {
            return createPortal(content, pipWindow.document.body);
        }

        return content;
    };

    // Spotify Mini Player (Square Card) Conditional Render
    if (playerMode === 'mini') {
        const titleText = cleanTrack || currentTitle || 'No title';
        const artistText = cleanArtist || 'Unknown artist';
        
        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel pip-style mode-mini ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                {/* Spotify Mini Header */}
                <div className="spotify-header">
                    <button className="spotify-close-dot" onClick={handleExpand} title="Expand to Full Lyrics" aria-label="Close dot" />
                    <div className="spotify-grip-center">
                        <GripGrid2x4 />
                    </div>
                </div>

                {/* Spotify Mini Artwork & Body */}
                <div className="spotify-body">
                    {/* Radial gradient background using dominant color */}
                    <div className="spotify-ambient-backdrop" style={{ background: `radial-gradient(circle, ${backgroundColor} 0%, rgba(18,18,18,0.9) 100%)` }} />
                    
                    <div className="spotify-artwork-card">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt="Album Art" className="spotify-album-art" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={170} />
                        )}
                        
                        {/* Hover controls overlay */}
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

                {/* Spotify Mini Footer */}
                <div className="spotify-footer">
                    <div className="spotify-track-title" title={titleText}>{titleText}</div>
                    <div className="spotify-track-artist" title={artistText}>{artistText}</div>
                </div>
            </div>
        );
    }

    // Spotify Ultra Player (Capsule Pill) Conditional Render
    if (playerMode === 'ultra') {
        const titleText = cleanTrack || currentTitle || 'No title';
        const artistText = cleanArtist || 'Unknown artist';
        
        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel pip-style mode-ultra ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
                style={panelStyle}
                onMouseDown={!isPipMode ? handleDragStart : undefined}
            >
                {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}
                <div className="spotify-pill-content">
                    {/* Left control section */}
                    <div className="spotify-pill-left">
                        <button className="spotify-close-dot" onClick={handleExpand} title="Expand to Full Lyrics" aria-label="Close dot" />
                        <div className="spotify-pill-grip">
                            <GripGrid2x3 />
                        </div>
                    </div>

                    {/* Artwork thumbnail */}
                    <div className="spotify-pill-artwork">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt="Album Art" className="spotify-pill-img" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={24} />
                        )}
                    </div>

                    {/* Track info */}
                    <div className="spotify-pill-info">
                        <div className="spotify-pill-title" title={titleText}>{titleText}</div>
                        <div className="spotify-pill-artist" title={artistText}>{artistText}</div>
                    </div>

                    {/* Right controls */}
                    <div className="spotify-pill-right">
                        <button className="spotify-pill-btn play-btn" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} aria-label={isPaused ? 'Play' : 'Pause'}>
                            {isPaused ? <PlayIcon size={10} /> : <PauseIcon size={10} />}
                        </button>
                        <button className="spotify-pill-btn next-btn" onClick={nextSong} title="Next Song" aria-label="Next">
                            <NextIcon size={12} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Loading state
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
                        <span className="loading-ring loading-ring-one"></span>
                        <span className="loading-ring loading-ring-two"></span>
                        <span className="loading-dot"></span>
                    </div>
                    <div className="loading-text">Finding lyrics</div>
                    <div className="loading-subtext">{currentTitle || 'Listening for the current song'}</div>
                    <div className="loading-bars" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        );
    }

    // No lyrics state
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
                    <div className="no-lyrics-icon" aria-hidden="true"></div>
                    <div className="no-lyrics-text">
                        {error || 'No lyrics available for this video'}
                    </div>
                    <button className="retry-btn" onClick={refetch}>
                        Try again
                    </button>
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
                            aria-label="Artist optional"
                        />
                        <button type="submit" disabled={!manualTrack.trim()}>
                            Search lyrics
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Build the panel content
    const isHorizontal = activeHeight < 220;
    const panelContent = (
        <div
            ref={panelRef}
            className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''} mode-${playerMode} ${isHorizontal ? 'layout-horizontal' : ''}`}
            style={panelStyle}
            onMouseDown={!isPipMode ? handleDragStart : undefined}
        >
            {!isPipMode && <ResizeHandles onResizeStart={handleResizeStart} />}

            {/* Drag handle bar at top - only show in in-page mode */}
            {!isPipMode && (
                <div className="drag-handle">
                    <span className="drag-indicator">{"\u22ee\u22ee"}</span>
                </div>
            )}

            {/* Header — clean: actions left, source right */}
            <div className="source-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button className="source-btn download-btn" onClick={handleDownload} title="Download .lrc (saves with offset)" style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}>
                        <DownloadIcon size={14} />
                    </button>
                    {source === 'local' && (
                        <button className="source-btn delete-btn" onClick={handleDeleteLocal} title="Delete saved lyrics" style={{ background: 'rgba(255,80,80,0.15)', borderColor: 'rgba(255,80,80,0.3)', height: '26px', padding: '0 8px' }}>
                            Del
                        </button>
                    )}
                    <button className="source-btn" onClick={() => setIsSearchVisible(!isSearchVisible)} title="Manual search" style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}>
                        <SearchIcon size={14} />
                    </button>
                </div>

                <div className="source-buttons">
                    <span className="source-name" style={{ display: 'flex', alignItems: 'center', height: '26px', boxSizing: 'border-box' }}>
                        {source === 'local' && 'Local (Saved)'}
                        {source === 'lrclib' && 'LRCLIB'}
                    </span>
                    {hasMoreResults && (
                        <button className="source-btn next-btn" onClick={tryNextResult} title="Try next lyrics result" style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}>
                            <RefreshIcon size={14} />
                        </button>
                    )}
                    <button
                        className="source-btn pip-btn"
                        onClick={isPipMode ? onClosePip : onOpenPip}
                        title={isPipMode ? "Pop In (return to page)" : "Pop Out (floating window)"}
                        style={{ display: 'grid', placeItems: 'center', padding: '4px', width: '26px', height: '26px' }}
                    >
                        {isPipMode ? "\u2193" : "\u2191"}
                    </button>
                </div>
            </div>

            {/* Inline manual search (toggled) */}
            {isSearchVisible && (
                <div style={{ position: 'absolute', top: '56px', left: 0, right: 0, zIndex: 6, padding: '6px 12px', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
                    <form className="manual-search" onSubmit={(e) => { handleManualSearch(e); setIsSearchVisible(false); }} style={{ flexDirection: 'row', gap: '6px', marginTop: 0 }}>
                        <input
                            value={manualTrack}
                            onChange={(e) => setManualTrack(e.target.value)}
                            placeholder="Song name"
                            aria-label="Song name"
                            style={{ flex: 1 }}
                        />
                        <input
                            value={manualArtist}
                            onChange={(e) => setManualArtist(e.target.value)}
                            placeholder="Artist"
                            aria-label="Artist"
                            style={{ flex: 1 }}
                        />
                        <button type="submit" disabled={!manualTrack.trim()}>Go</button>
                    </form>
                </div>
            )}

            {/* Offset Controls */}
            <div className={`offset-controls ${isAdjusting ? 'adjusting' : ''}`}>
                <button className="offset-btn" onClick={() => stepOffset(-5)} title="Lyrics 5s later (delay)">-5</button>
                <button className="offset-btn" onClick={() => stepOffset(-1)} title="Lyrics 1s later (delay)">-1</button>
                <button className="offset-btn" onClick={() => stepOffset(-0.2)} title="Lyrics 0.2s later (delay)">-.2</button>
                <button
                    ref={offsetValueRef}
                    className="offset-value"
                    onMouseDown={handleOffsetMouseDown}
                    title="Drag to scrub  •  Scroll to fine-tune (Shift = coarse, Ctrl = ultra-fine)  •  Click to reset"
                >
                    {offset >= 0 ? '+' : ''}{offset.toFixed(2)}s
                </button>
                <button className="offset-btn" onClick={() => stepOffset(0.2)} title="Lyrics 0.2s earlier">+.2</button>
                <button className="offset-btn" onClick={() => stepOffset(1)} title="Lyrics 1s earlier">+1</button>
                <button className="offset-btn" onClick={() => stepOffset(5)} title="Lyrics 5s earlier">+5</button>
                <div className="offset-hint" aria-live="polite">
                    {offset === 0
                        ? 'in sync'
                        : offset > 0
                            ? `lyrics ${offset.toFixed(2)}s earlier than source`
                            : `lyrics ${Math.abs(offset).toFixed(2)}s later than source`}
                </div>
            </div>

            {/* Next-line preview — small banner overlaying the top of the lyrics
                area showing what plays next and when. Always visible during
                playback whenever the next line is < 8s away. */}
            {showNextLine && nextLine && (
                <div className="next-line-preview" aria-hidden="true">
                    <span className="next-line-countdown">in {timeToNext.toFixed(1)}s</span>
                    <span className="next-line-text">{nextLine.text}</span>
                </div>
            )}

            <div ref={scrollRef} className={`streamlyrics-scroll-container ${isAdjusting ? 'adjusting' : ''}`}>
                {/* "You are here" marker — anchored to raw audio time within the
                    lyric flow, independent of offset. Pairs with the karaoke
                    fill on the active line to make any misalignment obvious. */}
                <div ref={audioMarkerRef} className="audio-position-marker" aria-hidden="true" />

                {lines.map((line, index) => (
                    <div
                        key={`${line.start}-${index}`}
                        ref={(el) => { lineRefs.current[index] = el; }}
                    >
                        <LyricLineComponent
                            text={line.text}
                            isActive={index === currentLineIndex}
                            isPast={index < currentLineIndex}
                            onClick={(e) => handleLineClick(index, e)}
                        />
                    </div>
                ))}

                {/* Instrumental indicator */}
                {isInstrumental() && (
                    <div className="instrumental-break">
                        {"\u266a"} Instrumental {"\u266a"}
                    </div>
                )}
            </div>

            {/* Bottom Player Dock */}
            <div className="player-dock">
                {/* Animated visualizer bars */}
                <div className="visualizer" aria-hidden="true">
                    {bars.map((h, i) => (
                        <span key={i} className="viz-bar" style={{ height: `${Math.max(4, h * 28)}px`, animationDelay: `${i * 0.04}s` }} />
                    ))}
                </div>

                {/* Apple-style Album Art / Metadata Cockpit for Compact & Ultra Modes */}
                <div className="metadata-cockpit">
                    <div className="thumbnail-container">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt="Album Art" className="album-art" draggable="false" />
                        ) : (
                            <AbstractThumbnail size={56} />
                        )}
                    </div>
                    <div className="track-info">
                        <div className="track-title" title={cleanTrack}>
                            {cleanTrack || currentTitle || 'No title'}
                        </div>
                        <div className="track-artist" title={cleanArtist}>
                            {cleanArtist || 'Unknown artist'}
                        </div>
                    </div>
                </div>

                {/* Playback buttons */}
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
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <polyline points="9 21 3 21 3 15"></polyline>
                            <line x1="21" y1="3" x2="14" y2="10"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );

    return renderPanel(panelContent);
};

/**
 * Resize handles component for all corners and edges
 */
const ResizeHandles: React.FC<{ onResizeStart: (dir: string) => (e: React.MouseEvent) => void }> = ({ onResizeStart }) => (
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
