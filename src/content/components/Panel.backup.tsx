import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LyricLine as LyricLineComponent } from './LyricLine';
import { useVideoSync } from '../hooks/useVideoSync';
import { useTranscript } from '../hooks/useTranscript';
import { useDominantColor } from '../hooks/useDominantColor';
import { LyricsSource } from '../services/transcriptService';
import { storageService } from '../services/storageService';
import { cleanVideoTitle, getCurrentTrackInfo, getLyricsSearchTitle } from '../utils/transcriptParser';

interface PanelProps {
    isVisible: boolean;
    isPipMode: boolean;
    pipWindow: Window | null;
    onOpenPip: () => void;
    onClosePip: () => void;
}

const INSTRUMENTAL_GAP_THRESHOLD = 10; // seconds
const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

/**
 * Main lyrics panel component - PIP-style (draggable + resizable)
 * Can render in-page or in a floating PIP window
 */
export const Panel: React.FC<PanelProps> = ({ isVisible, isPipMode, pipWindow, onOpenPip, onClosePip }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
    const panelRef = useRef<HTMLDivElement>(null);

    // Panel dimensions and position
    const [panelWidth, setPanelWidth] = useState(380);
    const [panelHeight, setPanelHeight] = useState(500);
    const [panelX, setPanelX] = useState(window.innerWidth - 400);
    const [panelY, setPanelY] = useState(80);

    // Interaction states
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const { lines, isLoading, error, source, currentTitle, refetch, searchManual, switchSource, tryNextResult, hasMoreResults } = useTranscript();
    const { currentLineIndex, isPaused, currentTime, offset, seekTo, adjustOffset, resetOffset, togglePlayPause } = useVideoSync(lines);
    const backgroundColor = useDominantColor();
    const [manualArtist, setManualArtist] = useState('');
    const [manualTrack, setManualTrack] = useState('');
    const [isSearchVisible, setIsSearchVisible] = useState(false);

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
        if ((e.target as HTMLElement).closest('.resize-handle, .offset-btn, .source-btn, .lyric-line, .manual-search, .retry-btn, .playback-controls')) return;
        e.preventDefault();
        setIsDragging(true);
        setDragOffset({ x: e.clientX - panelX, y: e.clientY - panelY });
    }, [panelX, panelY]);

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
                const newX = Math.max(0, Math.min(window.innerWidth - panelWidth, e.clientX - dragOffset.x));
                const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
                setPanelX(newX);
                setPanelY(newY);
            }

            if (isResizing) {
                const panel = panelRef.current;
                if (!panel) return;

                // Handle resizing based on direction
                if (isResizing.includes('e')) {
                    const newWidth = e.clientX - panelX;
                    setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
                }
                if (isResizing.includes('w')) {
                    const newWidth = panelX + panelWidth - e.clientX;
                    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
                        setPanelX(e.clientX);
                        setPanelWidth(newWidth);
                    }
                }
                if (isResizing.includes('s')) {
                    const newHeight = e.clientY - panelY;
                    setPanelHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, newHeight)));
                }
                if (isResizing.includes('n')) {
                    const newHeight = panelY + panelHeight - e.clientY;
                    if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT) {
                        setPanelY(e.clientY);
                        setPanelHeight(newHeight);
                    }
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, panelX, panelY, panelWidth, panelHeight, dragOffset]);

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
     * Handle clicking on a lyric line to seek
     */
    const handleLineClick = (index: number) => {
        if (lines[index]) {
            const seekTime = Math.max(0, lines[index].start - offset);
            seekTo(seekTime);
        }
    };

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
     * Removes cached lyrics and switches to API source
     */
    const handleDeleteLocal = async () => {
        const videoTitle = getLyricsSearchTitle(getCurrentTrackInfo());
        const { artist, track } = cleanVideoTitle(videoTitle);

        if (!confirm(`Delete saved lyrics for "${track}" by ${artist}?`)) {
            return;
        }

        await storageService.deleteLyrics(artist, track);

        // Force refresh to fetch from API sources
        window.location.reload();
    };

    const panelStyle = isPipMode ? {
        backgroundColor,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
    } : {
        backgroundColor,
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        left: `${panelX}px`,
        top: `${panelY}px`,
        position: 'fixed' as const,
        cursor: isDragging ? 'grabbing' : 'default',
    };

    const renderPanel = (content: React.ReactElement) => {
        if (isPipMode && pipWindow) {
            return createPortal(content, pipWindow.document.body);
        }

        return content;
    };

    // Loading state
    if (isLoading) {
        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel pip-mode ${isVisible ? '' : 'hidden'}`}
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
        return renderPanel(
            <div
                ref={panelRef}
                className={`streamlyrics-panel pip-mode ${isVisible ? '' : 'hidden'}`}
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
    const panelContent = (
        <div
            ref={panelRef}
            className={`streamlyrics-panel ${isPipMode ? 'in-pip-window' : 'pip-style'} ${isVisible ? '' : 'hidden'} ${isDragging || isResizing ? 'interacting' : ''}`}
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

            {/* Header with source selector buttons */}
            <div className="source-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button className="source-btn download-btn" onClick={handleDownload} title="Download .lrc (saves with offset)">
                        {"\u2193"}
                    </button>
                    {source === 'local' && (
                        <button className="source-btn delete-btn" onClick={handleDeleteLocal} title="Delete saved lyrics" style={{ background: 'rgba(255,80,80,0.15)', borderColor: 'rgba(255,80,80,0.3)' }}>
                            Del
                        </button>
                    )}
                    <button className="source-btn" onClick={() => setIsSearchVisible(!isSearchVisible)} title="Manual search">
                        {"\uD83D\uDD0D"}
                    </button>
                </div>

                {/* Playback controls */}
                <div className="playback-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button className="source-btn" onClick={prevSong} title="Previous song">{"\u23EE"}</button>
                    <button className="source-btn" onClick={() => skipVideo(-5)} title="Rewind 5s">{"\u23EA"}</button>
                    <button className="source-btn" onClick={togglePlayPause} title={isPaused ? 'Play' : 'Pause'} style={{ fontSize: '12px' }}>
                        {isPaused ? "\u25B6" : "\u23F8"}
                    </button>
                    <button className="source-btn" onClick={() => skipVideo(5)} title="Forward 5s">{"\u23E9"}</button>
                    <button className="source-btn" onClick={nextSong} title="Next song">{"\u23ED"}</button>
                </div>

                {/* Source display and cycle button */}
                <div className="source-buttons">
                    <span className="source-name">
                        {source === 'local' && 'Local (Saved)'}
                        {source === 'youtube' && 'YouTube'}
                        {source === 'lrclib' && 'LRCLIB'}
                    </span>
                    {hasMoreResults && (
                        <button className="source-btn next-btn" onClick={tryNextResult} title="Try next lyrics result">
                            {"\u21bb"}
                        </button>
                    )}
                    <button
                        className="source-btn pip-btn"
                        onClick={isPipMode ? onClosePip : onOpenPip}
                        title={isPipMode ? "Pop In (return to page)" : "Pop Out (floating window)"}
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
                        ref={(el) => { lineRefs.current[index] = el; }}
                    >
                        <LyricLineComponent
                            text={line.text}
                            isActive={index === currentLineIndex}
                            isPast={index < currentLineIndex}
                            onClick={() => handleLineClick(index)}
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
