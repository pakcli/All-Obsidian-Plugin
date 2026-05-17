# UI Components Refactoring Brief

## Problem

DiagramRenderer.ts is still too large (~600 lines) and mixes orchestration logic with UI rendering code. The class contains:

1. **Settings Panel Rendering** (~150 lines)
   - `renderSettingsPanel()` method
   - `createSpinner()` helper method
   - Settings state management

2. **Control Bar Rendering** (~50 lines)
   - `renderTopControlBar()` method
   - Button creation and event handlers

3. **Core Orchestration** (~400 lines)
   - View mode switching
   - Tree/table rendering coordination
   - State management

## Proposed Solution

Extract UI components into separate modules under `src/ui/`:

```
src/
├── ui/
│   ├── SettingsPanel.ts      # Settings panel component
│   ├── ControlBar.ts          # Top control bar component
│   └── Spinner.ts             # Reusable spinner component
├── renderers/
│   └── DiagramRenderer.ts     # Orchestrator only (~300 lines)
```

## Benefits

1. **Separation of Concerns**: DiagramRenderer focuses on orchestration, UI components handle their own rendering
2. **Reusability**: UI components can be reused in other parts of the plugin
3. **Testability**: UI components can be tested independently
4. **Maintainability**: Smaller, focused files are easier to understand and modify
5. **Line Count**: DiagramRenderer reduced from 600 to ~300 lines

## Components to Extract

### 1. SettingsPanel Component

**Responsibilities**:
- Render settings panel UI
- Handle settings changes
- Manage panel open/close state

**Interface**:
```typescript
class SettingsPanel {
  constructor(
    config: TreeConfig,
    viewMode: ViewMode,
    levelNumberOffset: number,
    onConfigChange: (config: Partial<TreeConfig>) => void,
    onViewModeChange: (mode: ViewMode) => void,
    onOffsetChange: (offset: number) => void
  )
  
  render(container: HTMLElement, isOpen: boolean): void
}
```

### 2. ControlBar Component

**Responsibilities**:
- Render top control bar with buttons
- Handle button clicks
- Manage button states

**Interface**:
```typescript
class ControlBar {
  constructor(
    interactive: boolean,
    onInteractiveToggle: () => void,
    onCopy: () => Promise<string>,
    onSettingsToggle: () => void
  )
  
  render(container: HTMLElement): void
}
```

### 3. Spinner Component

**Responsibilities**:
- Render number spinner UI
- Handle increment/decrement
- Validate min/max bounds

**Interface**:
```typescript
class Spinner {
  constructor(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  )
  
  render(): HTMLElement
}
```

## Implementation Plan

### Phase 1: Extract Spinner Component
1. Create `src/ui/Spinner.ts`
2. Move `createSpinner()` logic to Spinner class
3. Update DiagramRenderer to use Spinner component

### Phase 2: Extract ControlBar Component
1. Create `src/ui/ControlBar.ts`
2. Move `renderTopControlBar()` logic to ControlBar class
3. Update DiagramRenderer to use ControlBar component

### Phase 3: Extract SettingsPanel Component
1. Create `src/ui/SettingsPanel.ts`
2. Move `renderSettingsPanel()` logic to SettingsPanel class
3. Move spinner creation logic to SettingsPanel
4. Update DiagramRenderer to use SettingsPanel component

### Phase 4: Cleanup and Verification
1. Remove extracted methods from DiagramRenderer
2. Verify all functionality works
3. Run build and test
4. Verify line count reduction

## Expected Results

**Before**:
- DiagramRenderer.ts: ~600 lines (orchestration + UI)

**After**:
- DiagramRenderer.ts: ~300 lines (orchestration only)
- SettingsPanel.ts: ~150 lines
- ControlBar.ts: ~50 lines
- Spinner.ts: ~50 lines

**Total Reduction**: Same functionality, better organization

## Notes

- This is a follow-up refactoring to the main modular structure refactoring
- Focus on extracting UI rendering logic while keeping orchestration in DiagramRenderer
- Maintain all existing functionality and behavior
- No changes to user-facing features
