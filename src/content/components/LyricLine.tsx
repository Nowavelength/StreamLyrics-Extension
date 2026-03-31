import React from 'react';

interface LyricLineProps {
    text: string;
    isActive: boolean;
    isPast: boolean;
    onClick: () => void;
}

/**
 * Individual lyric line component
 * Transitions between past (white), active (white + scale), and future (black dim)
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
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
        >
            {text}
        </div>
    );
};
