import React from 'react';

interface LyricLineProps {
    text: string;
    isActive: boolean;
    isPast: boolean;
    onClick: (e: React.MouseEvent) => void;
}

/**
 * Individual lyric line component
 * Transitions between past (white), active (white + scale), and future (black dim).
 * The active line uses a CSS background-clip:text gradient driven by the
 * `--progress` custom property (0–1) on its parent — see Panel.tsx where the
 * RAF imperatively writes this var to produce the karaoke fill.
 */
export const LyricLine: React.FC<LyricLineProps> = ({
    text,
    isActive,
    isPast,
    onClick,
}) => {
    const getClassName = () => {
        const base = 'lyric-line';

        if (isActive) return `${base} lyric-active`;
        if (isPast) return `${base} lyric-past`;
        return `${base} lyric-future`;
    };

    return (
        <div
            className={getClassName()}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    onClick(e as unknown as React.MouseEvent);
                }
            }}
        >
            {text}
        </div>
    );
};
