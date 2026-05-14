# Implementation Changes - Side Panel & Level Number Offset

## Summary

Implemented the following features:

1. **New Side Panel Layout** - Replaced top control bar with a side panel settings UI
2. **Level Number Offset** - Added offset feature to shift numbering depth
3. **Config Flag Support** - Added `-offsetlevelnumbered:` and `-currentview:` flags
4. **Breadcrumb Positioning** - Moved breadcrumb to top control bar (same level as buttons)
5. **Interactive Toggle Sync** - Synced interactive toggle between top bar and side panel

---

## Changes Made

### 1. New Configuration Flags

**File: `src/util.ts`**

Added two new config properties:
- `offsetLevelNumbered: number` - Offset for numbering (0 = root is 1, 1 = root has no number)
- `currentView: number` - View mode (1 = tree, 2 = table full, 3 = table folder)

**Config parsing now supports:**
```
-offsetlevelnumbered: 0
-currentview: 1
```

### 2. Level Number Offset Logic

**File: `src/util.ts` - `treeView()` function**

Updated numbering logic to apply offset:
```typescript
const effectiveDepth = root.depth - levelNumberOffset;
if (levelNumbered > 0 && effectiveDepth >= 0 && effectiveDepth < levelNumbered) {
    rootLine += `${numberPrefix}. `;
}
```

**How it works:**
- `offset: 0` → Root = 1, Level 2 = 1.1, Level 3 = 1.1.1
- `offset: 1` → Root = no number, Level 2 = 1, Level 3 = 1.1
- `offset: 2` → Root = no number, Level 2 = no number, Level 3 = 1

### 3. New UI Layout

**File: `src/TreeDiagramMarkdownRenderChild.ts`**

**Old Layout:**
```
┌─────────────────────────────────────────┐
│  [Interactive] [Show] [Num] [Copy]      │
├─────────────────────────────────────────┤
│  Tree content                           │
└─────────────────────────────────────────┘
```

**New Layout:**
```
┌──────────────────────────────────┬──────────────┐
│  [(v) interactive] [copy] [⋯]    │              │
├──────────────────────────────────┤  Settings    │
│                                  │  Panel       │
│  Tree content                    │  (opens on   │
│                                  │   click ⋯)   │
└──────────────────────────────────┴──────────────┘
```

### 4. Top Control Bar

**File: `src/TreeDiagramMarkdownRenderChild.ts` - `renderTopControlBar()`**

New top bar with 3 buttons:
- `(v) interactive` / `(>) interactive` - Toggle interactive mode
- `copy` - Copy tree to clipboard
- `⋯` - Open/close settings panel

### 5. Settings Panel

**File: `src/TreeDiagramMarkdownRenderChild.ts` - `renderSettingsPanel()`**

Side panel contains:
- **View mode dropdown** - Tree / Table FullView / Table FolderView
- **Interactive toggle** - ● ON / ○ OFF buttons (synced with top bar)
- **Start show level spinner** - [−] [value] [+]
- **Level numbered spinner** - [−] [value] [+]
- **Offset spinner** - [−] [value] [+]

### 6. Breadcrumb Positioning

**File: `src/TreeDiagramMarkdownRenderChild.ts` - `renderTableModeB()`**

Breadcrumb now renders in the top control bar:
```
┌────────────────────────────────────────────────┐
│  [Root > Level 2]  [(v) interactive] [copy] [⋯]│
├────────────────────────────────────────────────┤
│  Table content                                 │
└────────────────────────────────────────────────┘
```

### 7. Interactive Toggle Synchronization

Both toggles (top bar and side panel) update `this.config.interactive` and trigger re-render, keeping them in sync.

### 8. CSS Styling

**File: `styles.css`**

Added styles for:
- `.tree-main-layout` - Flex container for content + settings panel
- `.tree-content-area` - Left side content area
- `.tree-settings-panel` - Right side panel (width: 0 → 250px when open)
- `.tree-top-control-bar` - Top control buttons
- `.settings-group` - Settings panel groups
- `.settings-toggle` - ON/OFF toggle buttons
- `.table-breadcrumb-inline` - Inline breadcrumb in top bar

---

## Usage Examples

### Example 1: Tree with Offset

```tree
-interactive:true
-startshowlevel:2
-levelnumbered:3
-offsetlevelnumbered:1

Root
	Level 2
		Level 3
```

**Output:**
```
(v) Root
└──(>) 1. Level 2
    └──(>) 1.1. Level 3
```

### Example 2: Table View with Config

```tree
-interactive:true
-currentview:2
-levelnumbered:2
-offsetlevelnumbered:0

Root 1
	A level 2
		Level 3
```

**Output:** Table FullView with numbering starting from root

---

## Testing Checklist

- [x] TypeScript compiles without errors
- [ ] Side panel opens/closes on ⋯ click
- [ ] Interactive toggle syncs between top bar and side panel
- [ ] Level number offset works correctly (0, 1, 2)
- [ ] Breadcrumb appears in top bar for Table Mode B
- [ ] View mode dropdown switches between Tree/Table A/Table B
- [ ] All spinners update values correctly
- [ ] Config flags are parsed correctly

---

## Files Modified

1. `src/util.ts` - Added config properties and offset logic
2. `src/TreeDiagramMarkdownRenderChild.ts` - New UI layout and controls
3. `styles.css` - New styles for side panel and controls

---

## Next Steps

1. Test in Obsidian to verify UI behavior
2. Add auto-config-generation feature (when user clicks ⋯, auto-add missing flags)
3. Test breadcrumb navigation in Table Mode B
4. Verify offset numbering with different tree structures
