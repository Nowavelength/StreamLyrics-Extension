import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * VerticalScrollProgress — Normal mode.
 *
 * A right-edge rail that doubles as a scrollbar and a progress indicator for
 * the lyric list. The portion already scrolled past is filled with a darker
 * shade of the dominant color; the white rounded thumb can be dragged to read
 * ahead. Auto-scroll (driven by the active line) moves the thumb back into
 * place on its own, exactly like the native scroll behavior.
 */
export const VerticalScrollProgress: React.FC<{
    scrollRef: React.RefObject<HTMLDivElement>;
    fillColor: string;
    /** Bump this (e.g. currentLineIndex) to force a metrics recompute. */
    syncKey?: number;
}> = ({ scrollRef, fillColor, syncKey }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [metrics, setMetrics] = useState({ topPct: 0, sizePct: 100, scrollable: false });

    const recompute = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const { scrollTop, scrollHeight, clientHeight } = el;
        if (scrollHeight <= clientHeight + 1) {
            setMetrics({ topPct: 0, sizePct: 100, scrollable: false });
            return;
        }
        const sizePct = (clientHeight / scrollHeight) * 100;
        const topPct = (scrollTop / scrollHeight) * 100;
        setMetrics({ topPct, sizePct, scrollable: true });
    }, [scrollRef]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        recompute();
        el.addEventListener('scroll', recompute, { passive: true });
        const ro = new ResizeObserver(recompute);
        ro.observe(el);
        return () => {
            el.removeEventListener('scroll', recompute);
            ro.disconnect();
        };
    }, [scrollRef, recompute]);

    // Recompute when the caller signals a content / active-line change.
    useEffect(() => {
        recompute();
    }, [syncKey, recompute]);

    const scrollToClientY = useCallback(
        (clientY: number) => {
            const el = scrollRef.current;
            const track = trackRef.current;
            if (!el || !track) return;
            const rect = track.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
            el.scrollTop = frac * (el.scrollHeight - el.clientHeight);
        },
        [scrollRef],
    );

    const onThumbDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            draggingRef.current = true;
            const move = (ev: MouseEvent) => {
                if (!draggingRef.current) return;
                scrollToClientY(ev.clientY);
            };
            const up = () => {
                draggingRef.current = false;
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        },
        [scrollToClientY],
    );

    const onTrackDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            scrollToClientY(e.clientY);
        },
        [scrollToClientY],
    );

    if (!metrics.scrollable) return null;

    // Fill spans from the top down to the bottom of the thumb (content seen).
    const fillPct = Math.min(100, metrics.topPct + metrics.sizePct);

    return (
        <div
            ref={trackRef}
            className="sl-vscroll"
            onMouseDown={onTrackDown}
            aria-hidden="true"
        >
            <div
                className="sl-vscroll-fill"
                style={{ height: `${fillPct}%`, background: fillColor }}
            />
            <div
                className="sl-vscroll-thumb"
                style={{ top: `${metrics.topPct}%`, height: `${metrics.sizePct}%` }}
                onMouseDown={onThumbDown}
            />
        </div>
    );
};

/**
 * HorizontalSeekBar — Ultra mode.
 *
 * A draggable scrubber for the song. The completed portion is filled with a
 * darker shade of the dominant color; a white circular thumb can be dragged
 * to seek forward/backward.
 */
export const HorizontalSeekBar: React.FC<{
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    fillColor: string;
}> = ({ currentTime, duration, onSeek, fillColor }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragFrac, setDragFrac] = useState<number | null>(null);

    const baseFrac = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
    const frac = dragFrac ?? baseFrac;

    const fracFromClientX = useCallback((clientX: number) => {
        const track = trackRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }, []);

    const onDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const startFrac = fracFromClientX(e.clientX);
            setDragFrac(startFrac);
            const move = (ev: MouseEvent) => setDragFrac(fracFromClientX(ev.clientX));
            const up = (ev: MouseEvent) => {
                const f = fracFromClientX(ev.clientX);
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                setDragFrac(null);
                if (duration > 0) onSeek(f * duration);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        },
        [fracFromClientX, duration, onSeek],
    );

    return (
        <div ref={trackRef} className="sl-hseek" onMouseDown={onDown} aria-hidden="true">
            <div className="sl-hseek-track" />
            <div
                className="sl-hseek-fill"
                style={{ width: `${frac * 100}%`, background: fillColor }}
            />
            <div className="sl-hseek-thumb" style={{ left: `${frac * 100}%` }} />
        </div>
    );
};
