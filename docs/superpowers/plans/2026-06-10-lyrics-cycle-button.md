# Lyrics Cycle Button in Ultra Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-invasive button to the left side of the Ultra Window (pill player layout) that cycles through alternative lyrics results from LRCLIB when `hasMoreResults` is true.

**Architecture:** We will modify `Panel.tsx`'s render branch for `playerMode === 'ultra'` to conditionally render a `<button>` inside `.spotify-pill-left`. The button will trigger the existing `tryNextResult` callback. The styling will be defined in `panel.css` to blend with the drag grip (low opacity) and highlight (scale up and full opacity) on hover.

**Tech Stack:** React 18, TypeScript, CSS (Vanilla inside Shadow DOM)

---

### Task 1: Update Styling in `src/content/styles/panel.css`

**Files:**
- Modify: [panel.css](file:///c:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/styles/panel.css#L1010-L1017)

- [ ] **Step 1: Add style rules for `.spotify-pill-refresh-btn`**
  
  Add the following class rules before the `@keyframes fadeIn` declaration at the bottom of the file:
  
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

- [ ] **Step 2: Commit styling changes**
  
  Run: `git add src/content/styles/panel.css`
  Run: `git commit -m "style: add refresh button styles for ultra pill mode"`

---

### Task 2: Modify JSX structure in `src/content/components/Panel.tsx`

**Files:**
- Modify: [Panel.tsx](file:///c:/Users/dev%20chaudhary/OneDrive/ALL%20Random%20projects%20folder/working%20project/lyrics%20extention/src/content/components/Panel.tsx#L826-L832)

- [ ] **Step 1: Update the `.spotify-pill-left` container render logic**
  
  Modify the JSX inside `playerMode === 'ultra'` to render the cycle button when `hasMoreResults` is true:
  
  Replace lines 826-832:
  ```tsx
                  <div className="spotify-pill-content">
                      <div className="spotify-pill-left">
                          <button className="spotify-close-dot" onClick={handleExpand} title="Expand to Full Lyrics" aria-label="Expand panel" />
                          <div className="spotify-pill-grip">
                              <GripGrid2x3 />
                          </div>
                      </div>
  ```
  
  With:
  ```tsx
                  <div className="spotify-pill-content">
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

- [ ] **Step 2: Verify compiling and build output**
  
  Run: `npm run build`
  Expected: Successful compilation without any errors or warnings.

- [ ] **Step 3: Commit component changes**
  
  Run: `git add src/content/components/Panel.tsx`
  Run: `git commit -m "feat: add alternative lyrics cycler button to ultra pill layout"`
