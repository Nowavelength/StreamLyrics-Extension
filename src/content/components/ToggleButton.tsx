import React, { useEffect, useState } from 'react';

interface ToggleButtonProps {
    isActive: boolean;
    onClick: () => void;
}

/**
 * Toggle button injected into YouTube's player controls
 */
export const ToggleButton: React.FC<ToggleButtonProps> = ({ isActive, onClick }) => {
    return (
        <button
            className={`streamlyrics-toggle ${isActive ? 'active' : ''}`}
            onClick={onClick}
            title={isActive ? 'Hide lyrics' : 'Show lyrics'}
            aria-label={isActive ? 'Hide lyrics' : 'Show lyrics'}
        >
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
        </button>
    );
};

/**
 * Hook to inject toggle button into YouTube player controls
 */
export function useToggleButtonInjection(
    isVisible: boolean,
    setIsVisible: React.Dispatch<React.SetStateAction<boolean>>
) {
    const [mounted, setMounted] = useState(false);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        const injectButton = () => {
            // Find YouTube's right controls container
            const rightControls = document.querySelector('.ytp-right-controls');

            if (!rightControls) {
                // Retry if not found
                setTimeout(injectButton, 1000);
                return;
            }

            // Check if already injected
            if (rightControls.querySelector('.streamlyrics-toggle-container')) {
                return;
            }

            // Create container for React portal
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'streamlyrics-toggle-container';
            buttonContainer.style.display = 'inline-flex';
            buttonContainer.style.alignItems = 'center';

            // Insert before first child (leftmost position in right controls)
            rightControls.insertBefore(buttonContainer, rightControls.firstChild);

            setContainer(buttonContainer);
            setMounted(true);
        };

        injectButton();

        // Re-inject on YouTube navigation
        const observer = new MutationObserver(() => {
            if (!document.querySelector('.streamlyrics-toggle-container')) {
                injectButton();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        return () => {
            observer.disconnect();
            if (container) {
                container.remove();
            }
        };
    }, []);

    return { mounted, container, isVisible, setIsVisible };
}
