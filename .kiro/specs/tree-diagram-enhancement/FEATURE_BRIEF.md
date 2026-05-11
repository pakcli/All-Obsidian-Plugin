# Feature Brief: Multi-Root Interactive Tree Diagrams

## Overview

Enhance the Tree Diagram plugin to support multiple independent trees per code block and add interactive collapse/expand functionality with visual indicators.

## Feature Priorities

1. **HIGH PRIORITY**: Multiple tree roots per code block
2. **MEDIUM PRIORITY**: Interactive mode with collapse/expand
3. **LOW PRIORITY**: Expand all flag

---

## Feature 1: Multiple Tree Roots per Code Block

### Current Behavior
- One tree per code block
- Single root node at depth 0

### New Behavior
- Support multiple independent trees in a single code block
- Each tree starts with keyword: `tree akar [name]`
- Trees are rendered sequentially, separated visually

### Syntax

```markdown
```tree
tree akar a
	branch a1
		branch a11
	branch a2
		branch a21
tree akar b
	branch b1
		branch b11
	branch b2
		branch b21
```
```

### Expected Output

```
tree akar a
├── branch a1
│   └── branch a11
└── branch a2
    └── branch a21

tree akar b
├── branch b1
│   └── branch b11
└── branch b2
    └── branch b21
```

### Implementation Requirements

1. **Parser Changes**:
   - Detect lines starting with `tree akar` as root markers
   - Extract tree name from `tree akar [name]`
   - Create multiple root nodes instead of single root
   - Return array of trees instead of single tree

2. **Renderer Changes**:
   - Accept array of trees
   - Render each tree with its name as header
   - Add visual separation between trees (blank line or divider)

---

## Feature 2: Interactive Mode (Optional)

### Activation
Add `interactive` flag to code block language identifier:

```markdown
```tree interactive
tree akar a
	branch a1
		branch a11
```
```

### Visual Indicators

When a node has children:
- **(v)** = Expanded state (children are visible)
- **(>)** = Collapsed state (children are hidden)

Leaf nodes (no children) have no indicator.

### Example: Expanded State

```
tree akar
├──(v) branch when expanded
│   ├── branch a11
│   └── makan 6
└──(>) branch when collapsed
```

### Example: After Clicking "(v)"

```
tree akar
├──(>) branch when expanded
└──(>) branch when collapsed
```

### Example: After Clicking "(>)" on Second Branch

```
tree akar
├──(>) branch when expanded
└──(v) branch when collapsed
    ├── child 1
    └── child 2
```

### Interaction Behavior

1. **Click on (v)**:
   - Toggle to (>)
   - Hide all children (and their descendants)
   - Maintain collapsed state

2. **Click on (>)**:
   - Toggle to (v)
   - Show immediate children
   - Children maintain their own expanded/collapsed state

3. **Non-interactive elements**:
   - Node names remain non-clickable
   - Only the indicator (v)/(>) is clickable
   - Wikilinks in node names remain clickable

### Implementation Requirements

1. **Rendering**:
   - Add `(v)` or `(>)` prefix to nodes with children
   - Wrap indicator in clickable span element
   - Add CSS classes for styling

2. **State Management**:
   - Track expanded/collapsed state per node
   - Use node path or unique ID for state tracking
   - Persist state during re-renders

3. **Event Handlers**:
   - Click handler on indicator spans
   - Toggle state and re-render affected subtree
   - Prevent event bubbling to parent elements

4. **CSS Styling**:
   - Make indicators visually distinct (color, cursor)
   - Hover effects for better UX
   - Smooth transitions for expand/collapse

---

## Feature 3: Expand All Flag (Optional)

### Activation
Add `expandall` flag along with `interactive`:

```markdown
```tree interactive expandall
tree akar a
	branch a1
		branch a11
```
```

### Behavior

- **With `expandall`**: All nodes start in expanded state `(v)`
- **Without `expandall`**: Nodes start in collapsed state `(>)` (or configurable default)

### Implementation Requirements

1. **Flag Parsing**:
   - Parse code block language string for flags
   - Support multiple flags: `tree interactive expandall`
   - Flags are space-separated

2. **Initial State**:
   - If `expandall` present: set all nodes to expanded
   - If `expandall` absent: set all nodes to collapsed (or first level expanded)

---

## Code Block Flag Syntax

### Format
```
```tree [flag1] [flag2] [flag3]
```

### Supported Flags

| Flag | Description | Requires |
|------|-------------|----------|
| `interactive` | Enable collapse/expand functionality | - |
| `expandall` | Start with all nodes expanded | `interactive` |

### Examples

```markdown
# Basic tree (current behavior)
```tree
root
	child
```

# Multi-root tree
```tree
tree akar a
	branch a1
tree akar b
	branch b1
```

# Interactive tree
```tree interactive
root
	child
		grandchild
```

# Interactive + expand all
```tree interactive expandall
root
	child
		grandchild
```

# Multi-root + interactive + expand all
```tree interactive expandall
tree akar a
	branch a1
		branch a11
tree akar b
	branch b1
		branch b11
```
```

---

## Technical Architecture

### Parser Updates

```typescript
interface TreeOptions {
	interactive: boolean;
	expandAll: boolean;
}

interface ParseResult {
	trees: Node[];  // Array of root nodes
	options: TreeOptions;
}

function parseCodeBlock(source: string, flags: string): ParseResult {
	// Parse flags from language string
	// Detect "tree akar" markers
	// Create multiple root nodes
	// Return array of trees + options
}
```

### Renderer Updates

```typescript
function renderTrees(trees: Node[], options: TreeOptions): HTMLElement {
	// Render each tree
	// Add visual separators
	// If interactive, add indicators and handlers
	// Return container element
}
```

### State Management

```typescript
interface NodeState {
	path: string;  // Unique identifier
	expanded: boolean;
}

class TreeState {
	private states: Map<string, NodeState>;
	
	toggle(path: string): void;
	isExpanded(path: string): boolean;
	setAll(expanded: boolean): void;
}
```

---

## User Experience Considerations

1. **Visual Clarity**:
   - Clear distinction between expanded/collapsed indicators
   - Consistent spacing and alignment
   - Smooth animations for expand/collapse

2. **Accessibility**:
   - Keyboard navigation support
   - Screen reader friendly
   - Focus indicators

3. **Performance**:
   - Efficient re-rendering (only affected subtrees)
   - Handle large trees gracefully
   - Debounce rapid clicks

4. **Backwards Compatibility**:
   - Existing trees without flags work as before
   - No breaking changes to current syntax
   - Graceful degradation if flags not supported

---

## Testing Scenarios

### Multi-Root Trees
- [ ] Single tree (backwards compatibility)
- [ ] Two trees in one block
- [ ] Multiple trees (3+) in one block
- [ ] Trees with wikilinks
- [ ] Empty trees
- [ ] Trees with different depths

### Interactive Mode
- [ ] Expand/collapse single node
- [ ] Expand/collapse nested nodes
- [ ] Maintain state during interactions
- [ ] Click indicator only (not node name)
- [ ] Wikilinks still work in interactive mode

### Expand All Flag
- [ ] All nodes start expanded
- [ ] Can collapse after initial render
- [ ] Works with multi-root trees

### Flag Combinations
- [ ] `tree` (basic)
- [ ] `tree interactive`
- [ ] `tree interactive expandall`
- [ ] `tree expandall` (should ignore, requires interactive)

### Edge Cases
- [ ] Very deep trees (10+ levels)
- [ ] Very wide trees (100+ children)
- [ ] Mixed expanded/collapsed states
- [ ] Rapid clicking
- [ ] Copy button works with interactive trees

---

## Implementation Phases

### Phase 1: Multi-Root Support (HIGH PRIORITY)
1. Update parser to detect `tree akar` markers
2. Modify parseInput to return array of trees
3. Update renderer to handle multiple trees
4. Add visual separators between trees
5. Test with existing features (wikilinks, copy button)

### Phase 2: Interactive Mode (MEDIUM PRIORITY)
1. Parse `interactive` flag from code block
2. Add expand/collapse indicators (v)/(>)
3. Implement state management
4. Add click handlers
5. Update renderer to show/hide children
6. Add CSS styling

### Phase 3: Expand All Flag (LOW PRIORITY)
1. Parse `expandall` flag
2. Set initial state based on flag
3. Test with interactive mode
4. Document behavior

---

## Success Criteria

- [ ] Multiple trees render correctly in one code block
- [ ] Interactive mode allows collapse/expand of nodes
- [ ] Visual indicators (v)/(>) are clear and clickable
- [ ] Expand all flag works as expected
- [ ] No breaking changes to existing functionality
- [ ] Performance is acceptable for large trees
- [ ] Documentation is updated
- [ ] All tests pass

---

## Open Questions

1. **Default collapse behavior**: Should nodes start collapsed or expanded by default (without `expandall`)?
   - Option A: All collapsed except first level
   - Option B: All collapsed
   - Option C: All expanded (requires explicit collapse)

2. **Visual separator**: How should multiple trees be separated?
   - Option A: Blank line
   - Option B: Horizontal rule
   - Option C: Subtle divider line

3. **State persistence**: Should expanded/collapsed state persist across note reloads?
   - Option A: Yes, save to plugin data
   - Option B: No, reset on reload
   - Option C: Configurable in settings

4. **Keyboard shortcuts**: Should there be keyboard shortcuts for expand/collapse?
   - Option A: Yes (e.g., Space to toggle, Arrow keys to navigate)
   - Option B: No, mouse only
   - Option C: Future enhancement

---

## Related Requirements

This feature enhances the existing requirements:
- Requirement 1: Parser (add multi-root support)
- Requirement 2: Renderer (add interactive indicators)
- Requirement 3: Code block processing (parse flags)
- Requirement 5: Copy button (should copy current visible state)

## Dependencies

- Existing tree parsing logic
- Existing rendering logic
- Obsidian API for event handling
- CSS for styling indicators
