# Design Spec: Ultra Window Lyrics Cycle Button

This design document specifies the implementation of a lyrics alternative cycle button (Refresh button) in the Ultra Window (pill player mode) of StreamLyrics.

## Requirements

1. **Non-Invasive Cycle Button**: A button to cycle through alternative lyrics results from LRCLIB.
2. **Placement**: Located in the left-side section of the Ultra Window (`.spotify-pill-left`), positioned between the close/expand dot (`.spotify-close-dot`) and the drag grip indicator.
3. **Visibility**: Rendered only when `hasMoreResults` is true.
4. **Aesthetic Requirements**:
   - **Blended Baseline**: Transparent background with low-opacity gray/white (`rgba(255, 255, 255, 0.35)`) to blend with the drag grip.
   - **Obvious Highlight**: Highlight to pure white (`#ffffff`) and scale up slightly (`1.1x`) on hover.
   - **Size**: Small bounding box (`16px x 16px`) with a tiny icon (`11px`) to prevent cluttering the pill layout.

## Proposed Changes

### Component: `Panel.tsx`

Add the cycle button to the left section of the Ultra Window under `playerMode === 'ultra'`:

```tsx
<div className="spotify-pill-left">
    <button className="spotify-close-dot" onClick={handleExpand} title="Expand to Full Lyrics" aria-label="Expand panel" />
    {hasMoreResults && (
        <button
            className="spotify-pill-refresh-btn"
            onClick={tryNextResult}
            title="Try next lyrics result"
            aria-label="Next lyrics result"
        >
            <RefreshIcon size={11} />
        </button>
    )}
    <div className="spotify-pill-grip">
        <GripGrid2x3 />
    </div>
</div>
```

### Style: `panel.css`

Define styles for the cycle button to match the non-invasive specification:

```css
.spotify-pill-refresh-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    width: 16px;
    height: 16px;
    transition: color 0.15s ease, transform 0.15s ease;
}

.spotify-pill-refresh-btn:hover {
    color: #ffffff;
    transform: scale(1.1);
}

.spotify-pill-refresh-btn:active {
    transform: scale(0.95);
}
```

## Verification Plan

### Automated Verification
- Run `npm run build` to ensure the project bundles successfully.

### Manual Verification
- Render a web example/mockup of the pill player inside the scratch folder to verify the layout, hover interactions, transition animation, and cycle functionality.
- Load the built extension in a browser tab to verify real-world YouTube and YouTube Music rendering.
