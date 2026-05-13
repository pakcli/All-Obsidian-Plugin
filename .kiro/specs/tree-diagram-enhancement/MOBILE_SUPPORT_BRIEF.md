# Mobile Support Feature Brief

## Overview

Add comprehensive mobile support to the Tree Diagram plugin, ensuring excellent UX on phones and tablets with touch-friendly controls, responsive layouts, and mobile-optimized interactions.

---

## Goals

1. **Touch-Friendly Controls** - All interactive elements meet minimum touch target size (44x44px)
2. **Responsive Layout** - Adapts to narrow screens without horizontal scrolling
3. **Mobile Gestures** - Support swipe gestures for expand/collapse
4. **Performance** - Fast rendering and smooth interactions on mobile devices
5. **Cross-Platform** - Works on iOS Safari, Android Chrome, and tablets

---

## Target Devices

### Primary
- **Phones:** iPhone (iOS Safari), Android (Chrome)
- **Screen sizes:** 320px - 428px width
- **Orientation:** Portrait (primary), Landscape (secondary)

### Secondary
- **Tablets:** iPad, Android tablets
- **Screen sizes:** 768px - 1024px width
- **Orientation:** Both portrait and landscape

---

## Feature Requirements

### 1. Responsive Control Panel

#### Desktop Layout (≥768px)
```
┌────────────────────────────────────────────────────────┐
│        [🔧] Interactive  Show:|<|2|>|  Num:|<|2|>| [Copy] │
├────────────────────────────────────────────────────────┤
│ My Project Structure                                    │
│ (v) 1. Frontend                                         │
└────────────────────────────────────────────────────────┘
```

#### Mobile Layout (<768px) - Option A: Stacked
```
┌──────────────────────────┐
│ [☰]              [Copy] │ ← Hamburger + Copy
├──────────────────────────┤
│ My Project Structure     │
│ (v) 1. Frontend          │
└──────────────────────────┘

When hamburger clicked:
┌──────────────────────────┐
│ [☰]              [Copy] │
│ ┌──────────────────────┐ │
│ │ [🔧] Interactive     │ │ ← Dropdown menu
│ │ Show Level: |<|2|>|  │ │
│ │ Numbering:  |<|2|>|  │ │
│ └──────────────────────┘ │
├──────────────────────────┤
│ My Project Structure     │
└──────────────────────────┘
```

#### Mobile Layout (<768px) - Option B: Bottom Sheet
```
┌──────────────────────────┐
│ [⚙️]             [Copy] │ ← Settings icon + Copy
├──────────────────────────┤
│ My Project Structure     │
│ (v) 1. Frontend          │
│                          │
│                          │
└──────────────────────────┘

When settings clicked:
┌──────────────────────────┐
│ My Project Structure     │
│ (v) 1. Frontend          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← Overlay
│ ┌────────────────────────┤
│ │ Settings          [×] │ ← Bottom sheet
│ │                        │
│ │ [🔧] Interactive       │
│ │ Show Level: |<|2|>|    │
│ │ Numbering:  |<|2|>|    │
│ └────────────────────────┘
```

**Recommendation:** Option B (Bottom Sheet) - More native mobile feel

---

### 2. Touch-Friendly Controls

#### Minimum Touch Target Sizes
```css
/* WCAG 2.1 Level AAA: 44x44px minimum */
.tree-control-button {
    min-width: 44px;
    min-height: 44px;
    padding: 12px;
}

.spinner-button {
    min-width: 44px;
    min-height: 44px;
    font-size: 20px;
}

.tree-toggle {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
```

#### Touch Feedback
```css
/* Visual feedback on touch */
.tree-control-button:active {
    background-color: var(--background-modifier-hover);
    transform: scale(0.95);
}

/* Prevent text selection on double-tap */
.tree-control-button {
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
```

---

### 3. Mobile Gestures

#### Swipe to Expand/Collapse
```typescript
interface SwipeGesture {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    threshold: number; // 50px minimum
}

// Swipe right → Expand node
// Swipe left → Collapse node
```

**Behavior:**
- Swipe right (>50px) on collapsed node `(>)` → Expands to `(v)`
- Swipe left (>50px) on expanded node `(v)` → Collapses to `(>)`
- Vertical swipe → Scroll (no action)
- Short swipe (<50px) → No action (prevents accidental triggers)

#### Long Press for Context Menu (Future)
```typescript
// Long press (500ms) → Show context menu
// - Copy node
// - Copy subtree
// - Expand all children
// - Collapse all children
```

---

### 4. Responsive Typography

```css
/* Desktop */
@media (min-width: 1080px) {
    .tree-diagram {
        font-size: 14px;
        line-height: 1.6;
    }
}

/* Mobile */
@media (max-width: 1080px) {
    .tree-diagram {
        font-size: 16px; /* Larger for readability */
        line-height: 1.8; /* More spacing */
    }
    
    /* Larger toggles */
    .tree-toggle {
        font-size: 18px;
    }
}
```

---

### 5. Responsive Tree Layout

#### Prevent Horizontal Scrolling
```css
.tree-diagram-container {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: visible;
}

/* Wrap long node names on mobile */
@media (max-width: 767px) {
    .tree-node-name {
        word-wrap: break-word;
        overflow-wrap: break-word;
        max-width: calc(100vw - 80px); /* Account for indentation */
    }
}
```

#### Compact Indentation on Mobile
```css
/* Desktop: 4 spaces per level */
@media (min-width: 768px) {
    .tree-indent {
        width: 4ch;
    }
}

/* Mobile: 3 spaces per level (more compact) */
@media (max-width: 767px) {
    .tree-indent {
        width: 3ch;
    }
}
```

---

## Implementation Details

### 1. Device Detection

```typescript
class MobileDetector {
    static isMobile(): boolean {
        return window.innerWidth < 768;
    }
    
    static isTablet(): boolean {
        return window.innerWidth >= 768 && window.innerWidth < 1024;
    }
    
    static isTouchDevice(): boolean {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    
    static isIOS(): boolean {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }
    
    static isAndroid(): boolean {
        return /Android/.test(navigator.userAgent);
    }
}
```

### 2. Touch Event Handling

```typescript
class TouchHandler {
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private touchStartTime: number = 0;
    
    handleTouchStart(e: TouchEvent, node: HTMLElement) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchStartTime = Date.now();
    }
    
    handleTouchEnd(e: TouchEvent, node: HTMLElement, path: string) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndTime = Date.now();
        
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        const duration = touchEndTime - this.touchStartTime;
        
        // Detect swipe (horizontal movement > vertical movement)
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            if (deltaX > 0) {
                // Swipe right → Expand
                this.expandNode(path);
            } else {
                // Swipe left → Collapse
                this.collapseNode(path);
            }
            e.preventDefault();
        }
        
        // Detect long press (future feature)
        if (duration > 500 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
            this.showContextMenu(node, path);
            e.preventDefault();
        }
    }
}
```

### 3. Responsive Control Panel

```typescript
class ControlPanel {
    private isMobile: boolean;
    private menuOpen: boolean = false;
    
    render() {
        this.isMobile = MobileDetector.isMobile();
        
        if (this.isMobile) {
            return this.renderMobileControls();
        } else {
            return this.renderDesktopControls();
        }
    }
    
    renderMobileControls() {
        // Hamburger menu button
        const menuBtn = createEl('button', {
            cls: 'tree-menu-button',
            attr: { 'aria-label': 'Open settings' }
        });
        menuBtn.innerHTML = '☰';
        
        // Copy button (always visible)
        const copyBtn = createEl('button', {
            cls: 'tree-copy-button',
            text: 'Copy'
        });
        
        // Dropdown menu (hidden by default)
        const menu = createEl('div', {
            cls: 'tree-controls-menu'
        });
        menu.style.display = this.menuOpen ? 'block' : 'none';
        
        // Add controls to menu
        menu.appendChild(this.renderInteractiveToggle());
        menu.appendChild(this.renderShowLevelSpinner());
        menu.appendChild(this.renderNumberingSpinner());
        
        // Toggle menu on click
        menuBtn.onclick = () => {
            this.menuOpen = !this.menuOpen;
            menu.style.display = this.menuOpen ? 'block' : 'none';
        };
        
        return { menuBtn, copyBtn, menu };
    }
    
    renderDesktopControls() {
        // Inline controls (all visible)
        const controls = createEl('div', { cls: 'tree-controls-inline' });
        controls.appendChild(this.renderInteractiveToggle());
        controls.appendChild(this.renderShowLevelSpinner());
        controls.appendChild(this.renderNumberingSpinner());
        controls.appendChild(this.renderCopyButton());
        return controls;
    }
}
```

### 4. Bottom Sheet (Alternative to Dropdown)

```typescript
class BottomSheet {
    private sheet: HTMLElement;
    private overlay: HTMLElement;
    
    show() {
        // Create overlay
        this.overlay = createEl('div', { cls: 'bottom-sheet-overlay' });
        this.overlay.onclick = () => this.hide();
        
        // Create bottom sheet
        this.sheet = createEl('div', { cls: 'bottom-sheet' });
        this.sheet.innerHTML = `
            <div class="bottom-sheet-header">
                <h3>Settings</h3>
                <button class="bottom-sheet-close">×</button>
            </div>
            <div class="bottom-sheet-content">
                <!-- Controls here -->
            </div>
        `;
        
        // Animate in
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.sheet);
        
        setTimeout(() => {
            this.overlay.addClass('visible');
            this.sheet.addClass('visible');
        }, 10);
    }
    
    hide() {
        this.overlay.removeClass('visible');
        this.sheet.removeClass('visible');
        
        setTimeout(() => {
            this.overlay.remove();
            this.sheet.remove();
        }, 300);
    }
}
```

---

## CSS Implementation

### Responsive Breakpoints

```css
/* Mobile First Approach */

/* Base styles (Mobile) */
.tree-diagram-container {
    padding: 8px;
    font-size: 16px;
}

.tree-control-button {
    min-width: 44px;
    min-height: 44px;
}

/* Tablet (768px+) */
@media (min-width: 768px) {
    .tree-diagram-container {
        padding: 12px;
        font-size: 14px;
    }
    
    .tree-control-button {
        min-width: 36px;
        min-height: 36px;
    }
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
    .tree-diagram-container {
        padding: 16px;
    }
}
```

### Touch Feedback

```css
/* Remove default touch highlights */
* {
    -webkit-tap-highlight-color: transparent;
}

/* Custom touch feedback */
.tree-toggle:active,
.tree-control-button:active {
    background-color: var(--background-modifier-hover);
    transform: scale(0.95);
    transition: transform 0.1s ease;
}

/* Prevent text selection during touch */
.tree-toggle,
.tree-control-button {
    -webkit-user-select: none;
    user-select: none;
}
```

### Bottom Sheet Styles

```css
/* Overlay */
.bottom-sheet-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0);
    transition: background-color 0.3s ease;
    z-index: 1000;
}

.bottom-sheet-overlay.visible {
    background-color: rgba(0, 0, 0, 0.5);
}

/* Bottom Sheet */
.bottom-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: var(--background-primary);
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
    transform: translateY(100%);
    transition: transform 0.3s ease;
    z-index: 1001;
    max-height: 80vh;
    overflow-y: auto;
}

.bottom-sheet.visible {
    transform: translateY(0);
}

/* Bottom Sheet Header */
.bottom-sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--background-modifier-border);
}

.bottom-sheet-close {
    font-size: 24px;
    min-width: 44px;
    min-height: 44px;
    border: none;
    background: none;
    cursor: pointer;
}

/* Bottom Sheet Content */
.bottom-sheet-content {
    padding: 16px;
}

.bottom-sheet-control {
    margin-bottom: 16px;
}

.bottom-sheet-control label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
}
```

### Hamburger Menu Styles

```css
/* Menu Button */
.tree-menu-button {
    min-width: 44px;
    min-height: 44px;
    font-size: 20px;
    border: none;
    background: none;
    cursor: pointer;
}

/* Dropdown Menu */
.tree-controls-menu {
    position: absolute;
    top: 48px;
    right: 4px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 12px;
    min-width: 200px;
    z-index: 100;
}

.tree-controls-menu-item {
    padding: 12px;
    margin-bottom: 8px;
}

.tree-controls-menu-item:last-child {
    margin-bottom: 0;
}
```

---

## Testing Requirements

### Device Testing

**iOS:**
- [ ] iPhone SE (375px)
- [ ] iPhone 12/13/14 (390px)
- [ ] iPhone 14 Pro Max (428px)
- [ ] iPad (768px)
- [ ] iPad Pro (1024px)

**Android:**
- [ ] Small phone (360px)
- [ ] Medium phone (412px)
- [ ] Large phone (428px)
- [ ] Tablet (768px)

### Orientation Testing
- [ ] Portrait mode (primary)
- [ ] Landscape mode (secondary)
- [ ] Rotation handling (no layout breaks)

### Touch Testing
- [ ] All buttons are 44x44px minimum
- [ ] Swipe gestures work smoothly
- [ ] No accidental triggers
- [ ] Touch feedback is visible
- [ ] No text selection on double-tap

### Performance Testing
- [ ] Renders quickly on mobile (<1s)
- [ ] Smooth scrolling
- [ ] No lag when toggling nodes
- [ ] Animations are smooth (60fps)

### Browser Testing
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Samsung Internet
- [ ] Firefox Mobile

---

## Success Criteria

- ✅ All controls meet 44x44px minimum touch target
- ✅ No horizontal scrolling on any mobile device
- ✅ Swipe gestures work reliably
- ✅ Bottom sheet/menu opens smoothly
- ✅ Text is readable without zooming
- ✅ Works on iOS Safari and Android Chrome
- ✅ Performance is smooth (no lag)
- ✅ Layout adapts to portrait and landscape

---

## Future Enhancements

1. **Pinch to Zoom** - Zoom in/out on tree
2. **Pull to Refresh** - Refresh tree data
3. **Haptic Feedback** - Vibration on toggle (iOS/Android)
4. **Dark Mode Auto-Switch** - Follow system preference
5. **Offline Support** - Cache tree data
6. **Share Sheet** - Native share on mobile

---

## Implementation Priority

### Phase 1: Core Mobile Support (Week 1)
- [ ] Responsive control panel (hamburger menu)
- [ ] Touch-friendly button sizes (44x44px)
- [ ] Responsive typography
- [ ] Prevent horizontal scrolling

### Phase 2: Touch Interactions (Week 2)
- [ ] Swipe gestures for expand/collapse
- [ ] Touch feedback animations
- [ ] Bottom sheet (alternative to dropdown)

### Phase 3: Testing & Polish (Week 3)
- [ ] Test on real devices (iOS + Android)
- [ ] Performance optimization
- [ ] Bug fixes
- [ ] Documentation

---

## Estimated Effort

| Task | Time | Difficulty |
|------|------|------------|
| Responsive layout | 1 day | Easy |
| Touch-friendly controls | 1 day | Easy |
| Swipe gestures | 2 days | Medium |
| Bottom sheet | 1 day | Medium |
| Testing & polish | 2 days | Medium |
| **Total** | **7 days** | **Medium** |

---

## Grade Impact

**Current:** 97/100  
**After Mobile Support:** 98/100  
**Remaining:** Keyboard shortcuts (+1), Accessibility (+1)

