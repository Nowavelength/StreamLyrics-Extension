import React, { useMemo } from 'react';

/**
 * StreamLyrics visualizers.
 *
 * All three consume the shared `useAudioBars` output (normalized 0..1 FFT
 * amplitudes, mirrored: bass at center, treble at edges) but render with
 * deliberately distinct personalities per mode:
 *
 *   - NormalVisualizer : rounded bars in a pill. When the control dock is
 *                        summoned the pill chrome fades and the bars grow
 *                        symmetrically into a centered field.
 *   - MiniVisualizer   : a radial / circular equalizer that fills the square
 *                        slot in mini mode.
 *   - UltraVisualizer  : an LED dot-matrix VU meter for the wide ultra slot.
 *
 * `color` is the album's vibrant accent; callers pass `vibrantize(...)`.
 */

interface VizProps {
    bars: number[];
    color: string;
}

// ---------- Normal: pill of rounded bars -> symmetric field --------------
export const NormalVisualizer: React.FC<VizProps & { expanded: boolean }> = ({
    bars,
    color,
    expanded,
}) => {
    // Use a centered slice (skip the extreme treble edges for a fuller look).
    const slice = useMemo(() => bars.slice(3, 29), [bars]);

    return (
        <div className={`sl-viz-normal ${expanded ? 'expanded' : ''}`} aria-hidden="true">
            <div className="sl-viz-normal-pill" />
            <div className="sl-viz-normal-bars">
                {slice.map((h, i) => (
                    <span
                        key={i}
                        className="sl-viz-bar"
                        style={{
                            height: `${Math.max(8, h * 100)}%`,
                            background: color,
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

// ---------- Mini: radial / circular equalizer ----------------------------
export const MiniVisualizer: React.FC<VizProps> = ({ bars, color }) => {
    const SPOKES = 28;
    const slice = useMemo(() => {
        // Resample the mirrored bars into a smooth ring.
        const out: number[] = [];
        for (let i = 0; i < SPOKES; i++) {
            const idx = Math.floor((i / SPOKES) * bars.length);
            out.push(bars[idx] ?? 0.05);
        }
        return out;
    }, [bars]);

    return (
        <div className="sl-viz-radial" aria-hidden="true">
            {slice.map((h, i) => (
                <span
                    key={i}
                    className="sl-viz-radial-spoke"
                    style={{ transform: `rotate(${(i / SPOKES) * 360}deg)` }}
                >
                    <i
                        className="sl-viz-radial-bar"
                        style={{ height: `${18 + h * 60}%`, background: color }}
                    />
                </span>
            ))}
            <span className="sl-viz-radial-core" style={{ background: color }} />
        </div>
    );
};

// ---------- Ultra: LED dot-matrix VU meter -------------------------------
export const UltraVisualizer: React.FC<VizProps> = ({ bars, color }) => {
    const COLUMNS = 13;
    const ROWS = 5;
    const slice = useMemo(() => {
        const out: number[] = [];
        for (let i = 0; i < COLUMNS; i++) {
            const idx = Math.floor((i / COLUMNS) * bars.length);
            out.push(bars[idx] ?? 0.05);
        }
        return out;
    }, [bars]);

    return (
        <div className="sl-viz-matrix" aria-hidden="true">
            {slice.map((amp, c) => {
                const lit = Math.round(amp * ROWS);
                return (
                    <span key={c} className="sl-viz-matrix-col">
                        {Array.from({ length: ROWS }).map((_, r) => {
                            // Row 0 is the bottom of the column.
                            const isLit = r < lit;
                            return (
                                <i
                                    key={r}
                                    className={`sl-viz-dot ${isLit ? 'on' : ''}`}
                                    style={isLit ? { background: color } : undefined}
                                />
                            );
                        })}
                    </span>
                );
            })}
        </div>
    );
};
