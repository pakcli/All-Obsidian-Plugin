# Tree Diagram Plugin - Current Feature Brief

## Overview

Obsidian plugin for rendering tree diagrams from indented text with interactive collapse/expand functionality, hierarchical numbering, and collapsible title support.

---

## Configuration Flags

### `-interactive:` Flag

| Value | Behavior |
|-------|----------|
| `true` | Enable node-level collapse/expand toggles `(v)` and `(>)` for all nodes with children |
| `false` (default) | Static tree, no toggles, all nodes visible up to `startShowLevel` |

**Important:** 
- When `interactive:true` → Nodes show `(v)` or `(>)` toggles, user controls visibility by clicking
- When `interactive:false` → No toggles shown, tree is static and shows all nodes up to `startShowLevel` depth

### `-startShowLevel:` Flag

| Value | Behavior (Interactive Mode) | Behavior (Non-Interactive Mode) |
|-------|----------------------------|----------------------------------|
| `0` | Tree collapsed, shows title with "(more)" link | Tree collapsed, shows title with "(more)" link |
| `1` (default) | Root nodes visible with `(>)` toggles (collapsed) | Root nodes visible, no children |
| `2` | Root + children visible, roots auto-expanded with `(v)` | Root + children visible (static) |
| `3` | Root + 2 levels visible, auto-expanded | Root + 2 levels visible (static) |
| `n` | Auto-expand to depth n, user can expand further | Show all nodes up to depth n (static) |

**Key Differences:**
- **Interactive Mode:** `startShowLevel` controls initial expansion state, but users can expand/collapse any node
- **Non-Interactive Mode:** `startShowLevel` is a hard limit, shows all nodes up to that depth with no toggles

### `-levelnumbered:` Flag

| Value | Behavior |
|-------|----------|
| `0` (default) | No numbering |
| `1` | Number root nodes only (1., 2., 3.) |
| `2` | Number root + first level (1., 1.1., 1.2.) |
| `3` | Number root + two levels (1., 1.1., 1.1.1.) |
| `n` | Number up to depth n |

### `-title:` Flag

| Value | Behavior |
|-------|----------|
| Empty or not set | No title shown (unless `startShowLevel:0`, then auto-generate from root names) |
| Any text | Shows title as header above tree |

---

## Feature Details

### 1. Interactive Mode

**Enabled (`-interactive:true`):**

```tree
-interactive:true
-startShowLevel:1

Root
	Child 1
	Child 2
```

**Output:**
```
(>) Root
```

**Behavior:**
- Shows `(>)` and `(v)` toggles for all nodes with children
- Click `(>)` to expand → shows children and changes to `(v)`
- Click `(v)` to collapse → hides children and changes to `(>)`
- Toggles are selectable text (can be copied)
- User controls visibility by clicking toggles

---

**Disabled (`-interactive:false` or not set):**

```tree
-startShowLevel:2

Root
	Child 1
	Child 2
```

**Output:**
```
Root
├── Child 1
└── Child 2
```

**Behavior:**
- No toggles shown
- Tree is static (cannot collapse/expand)
- All nodes up to `startShowLevel` depth are visible
- Clean, simple tree view

---

### 2. Start Show Level

**With Interactive Mode (`-interactive:true`):**

```tree
-interactive:true
-startShowLevel:2

Root
	Child 1
		Grandchild 1
	Child 2
```

**Output (Initial):**
```
(v) Root
├──(>) Child 1
└──(>) Child 2
```

**Behavior:**
- `startShowLevel:1` → Only root visible with `(>)` toggle (collapsed)
- `startShowLevel:2` → Root + children visible, root auto-expanded with `(v)`, children collapsed with `(>)`
- `startShowLevel:3` → Root + children + grandchildren visible, all auto-expanded
- Users can expand/collapse any node beyond `startShowLevel`

---

**Without Interactive Mode (`-interactive:false`):**

```tree
-startShowLevel:2

Root
	Child 1
		Grandchild 1
	Child 2
```

**Output:**
```
Root
├── Child 1
└── Child 2
```

**Behavior:**
- `startShowLevel:1` → Only root visible, no children
- `startShowLevel:2` → Root + children visible (static)
- `startShowLevel:3` → Root + children + grandchildren visible (static)
- No toggles, tree is static
- `startShowLevel` is a hard limit on visible depth

---

### 3. Hierarchical Numbering

**Syntax:**
```tree
-levelnumbered:2

Root
	Child 1
	Child 2
```

**Output:**
```
1. Root
├── 1.1. Child 1
└── 1.2. Child 2
```

**Behavior:**
- Numbers appear before node names
- Hierarchical format: `1.`, `1.1.`, `1.1.1.`, etc.
- Only numbers nodes up to specified depth

---

### 4. Title with Collapsible Content

**Syntax:**
```tree
-title:My Project
-startShowLevel:0

Root
	Child
```

**Output (Initially):**
```
My Project (more)
```

**Output (After clicking "more"):**
```
My Project (less)
Root
├── Child
```

**Behavior:**
- When `startShowLevel:0`, title shows with `(more)` link
- Click `(more)` → expands tree, changes to `(less)`
- Click `(less)` → collapses tree, changes to `(more)`
- `(more)` and `(less)` are gray colored and selectable
- If no title provided and `startShowLevel:0`, auto-generates title from root names: "Root1, Root2, Root3 (more)"

---

### 5. Multi-Root Trees

**Syntax:**
```tree
Root 1
	Child 1
Root 2
	Child 2
```

**Output:**
```
Root 1
├── Child 1
Root 2
└── Child 2
```

**Behavior:**
- Any depth-0 node (no indentation) creates a new tree root
- Each root is treated as a separate tree
- Blank lines between trees for readability

---

### 6. Wikilinks

**Syntax:**
```tree
Root [[Page]]
	Child [[Page|Alias]]
```

**Output:**
```
Root [[Page]]
├── Child [[Alias]]
```

**Behavior:**
- Supports `[[target]]` and `[[target|alias]]` syntax
- Wikilinks are clickable and navigate to target page
- If node is purely a wikilink, uses alias as display name

---

## Meta Example: Tree Diagram About Tree Diagram Features

### Example: Tree Diagram Plugin Features Overview

**Input:**
````markdown
```tree
-title:Tree Diagram Plugin Features
-startShowLevel:2
-levelnumbered:2
-interactive:true

Configuration Flags
	Interactive Mode
		Enable Toggles
		Collapse/Expand Nodes
		User Control
	Start Show Level
		Initial Depth
		Auto-Expansion
		Level 0 (Collapsible)
		Level 1 (Roots Only)
		Level 2+ (Multiple Levels)
	Level Numbered
		Hierarchical Numbering
		Depth Control
		Format (1.1.1)
	Title
		Header Text
		Auto-Generation
		Collapsible Mode
Visual Features
	ASCII Art
		Branch Characters
		Tree Structure
		Indentation
	Toggle Indicators
		(v) Expanded
		(>) Collapsed
		Clickable
		Selectable Text
	Wikilinks
		[[Target]] Syntax
		[[Target|Alias]] Format
		Navigation
		Internal Links
Core Functionality
	Multi-Root Trees
		Multiple Trees
		Depth-0 Detection
		Automatic Separation
	Copy Button
		Plain Text Export
		Full Tree Copy
		Clipboard Integration
	Theme Support
		Light Theme
		Dark Theme
		Color Adaptation
```
````

**Output (Initial - Level 2 Auto-Expanded):**
```
Tree Diagram Plugin Features
(v) 1. Configuration Flags
├──(>) 1.1. Interactive Mode
├──(>) 1.2. Start Show Level
├──(>) 1.3. Level Numbered
└──(>) 1.4. Title
(v) 2. Visual Features
├──(>) 2.1. ASCII Art
├──(>) 2.2. Toggle Indicators
└──(>) 2.3. Wikilinks
(v) 3. Core Functionality
├──(>) 3.1. Multi-Root Trees
├──(>) 3.2. Copy Button
└──(>) 3.3. Theme Support
```

**Output (After clicking "Interactive Mode"):**
```
Tree Diagram Plugin Features
(v) 1. Configuration Flags
├──(v) 1.1. Interactive Mode
│   ├── Enable Toggles
│   ├── Collapse/Expand Nodes
│   └── User Control
├──(>) 1.2. Start Show Level
├──(>) 1.3. Level Numbered
└──(>) 1.4. Title
(v) 2. Visual Features
├──(>) 2.1. ASCII Art
├──(>) 2.2. Toggle Indicators
└──(>) 2.3. Wikilinks
(v) 3. Core Functionality
├──(>) 3.1. Multi-Root Trees
├──(>) 3.2. Copy Button
└──(>) 3.3. Theme Support
```

**Output (After clicking "Toggle Indicators"):**
```
Tree Diagram Plugin Features
(v) 1. Configuration Flags
├──(v) 1.1. Interactive Mode
│   ├── Enable Toggles
│   ├── Collapse/Expand Nodes
│   └── User Control
├──(>) 1.2. Start Show Level
├──(>) 1.3. Level Numbered
└──(>) 1.4. Title
(v) 2. Visual Features
├──(>) 2.1. ASCII Art
├──(v) 2.2. Toggle Indicators
│   ├── (v) Expanded
│   ├── (>) Collapsed
│   ├── Clickable
│   └── Selectable Text
└──(>) 2.3. Wikilinks
(v) 3. Core Functionality
├──(>) 3.1. Multi-Root Trees
├──(>) 3.2. Copy Button
└──(>) 3.3. Theme Support
```

---

### Example: Tree Diagram Use Cases

**Input:**
````markdown
```tree
-title:When to Use Tree Diagram Plugin
-startShowLevel:1
-levelnumbered:1
-interactive:true

Documentation
	Project Structure
		File Organization
		Folder Hierarchy
		Module Dependencies
	API Documentation
		Endpoint Structure
		Resource Hierarchy
		Authentication Flow
	User Guides
		Step-by-Step Tutorials
		Feature Breakdown
		Configuration Options
Planning
	Project Roadmap
		Phases
		Milestones
		Deliverables
	Task Breakdown
		Work Packages
		Subtasks
		Dependencies
	Decision Trees
		Options
		Criteria
		Outcomes
Knowledge Management
	Note Organization
		Topics
		Subtopics
		Related Notes
	Concept Maps
		Main Ideas
		Supporting Concepts
		Connections
	Learning Paths
		Prerequisites
		Core Topics
		Advanced Topics
```
````

**Output (Initial - Level 1):**
```
When to Use Tree Diagram Plugin
(>) 1. Documentation
(>) 2. Planning
(>) 3. Knowledge Management
```

**Output (After expanding "Documentation"):**
```
When to Use Tree Diagram Plugin
(v) 1. Documentation
├──(>) Project Structure
├──(>) API Documentation
└──(>) User Guides
(>) 2. Planning
(>) 3. Knowledge Management
```

---

### Example: Tree Diagram Syntax Guide

**Input:**
````markdown
```tree
-title:Tree Diagram Syntax Reference
-startShowLevel:0
-levelnumbered:3
-interactive:true

Basic Syntax
	Indentation
		Use Tabs (Not Spaces)
		One Tab = One Level
		Depth 0 = Root Node
	Node Format
		Plain Text
		With Wikilinks [[Page]]
		With Aliases [[Page|Display Name]]
Configuration Flags
	Flag Format
		Starts with Dash (-)
		Flag Name : Value
		Must Be at Top
	Interactive Flag
		-interactive:true
		-interactive:false
	Start Show Level Flag
		-startShowLevel:0
		-startShowLevel:1
		-startShowLevel:2
		-startShowLevel:3
	Level Numbered Flag
		-levelnumbered:0
		-levelnumbered:1
		-levelnumbered:2
		-levelnumbered:3
	Title Flag
		-title:Your Title
		-title: (Empty for Auto)
Advanced Features
	Multi-Root Trees
		Multiple Depth-0 Nodes
		Automatic Detection
		Separate Trees
	Wikilink Integration
		Click to Navigate
		Alias Support
		Internal Links
	Copy Functionality
		Copy Button
		Plain Text Output
		Preserves Structure
```
````

**Output (Initially Collapsed):**
```
Tree Diagram Syntax Reference (more)
```

**Output (After clicking "more"):**
```
Tree Diagram Syntax Reference (less)
(>) 1. Basic Syntax
(>) 2. Configuration Flags
(>) 3. Advanced Features
```

**Output (After expanding all to show full tree):**
```
Tree Diagram Syntax Reference (less)
(v) 1. Basic Syntax
├──(v) 1.1. Indentation
│   ├── 1.1.1. Use Tabs (Not Spaces)
│   ├── 1.1.2. One Tab = One Level
│   └── 1.1.3. Depth 0 = Root Node
└──(v) 1.2. Node Format
    ├── 1.2.1. Plain Text
    ├── 1.2.2. With Wikilinks [[Page]]
    └── 1.2.3. With Aliases [[Page|Display Name]]
(v) 2. Configuration Flags
├──(v) 2.1. Flag Format
│   ├── 2.1.1. Starts with Dash (-)
│   ├── 2.1.2. Flag Name : Value
│   └── 2.1.3. Must Be at Top
├──(v) 2.2. Interactive Flag
│   ├── 2.2.1. -interactive:true
│   └── 2.2.2. -interactive:false
├──(v) 2.3. Start Show Level Flag
│   ├── 2.3.1. -startShowLevel:0
│   ├── 2.3.2. -startShowLevel:1
│   ├── 2.3.3. -startShowLevel:2
│   └── 2.3.4. -startShowLevel:3
├──(v) 2.4. Level Numbered Flag
│   ├── 2.4.1. -levelnumbered:0
│   ├── 2.4.2. -levelnumbered:1
│   ├── 2.4.3. -levelnumbered:2
│   └── 2.4.4. -levelnumbered:3
└──(v) 2.5. Title Flag
    ├── 2.5.1. -title:Your Title
    └── 2.5.2. -title: (Empty for Auto)
(v) 3. Advanced Features
├──(v) 3.1. Multi-Root Trees
│   ├── 3.1.1. Multiple Depth-0 Nodes
│   ├── 3.1.2. Automatic Detection
│   └── 3.1.3. Separate Trees
├──(v) 3.2. Wikilink Integration
│   ├── 3.2.1. Click to Navigate
│   ├── 3.2.2. Alias Support
│   └── 3.2.3. Internal Links
└──(v) 3.3. Copy Functionality
    ├── 3.3.1. Copy Button
    ├── 3.3.2. Plain Text Output
    └── 3.3.3. Preserves Structure
```

---

## Quick Reference Examples

### Example A: Interactive with Level 1 Start

**Input:**
````markdown
```tree
-title:Project Timeline
-startShowLevel:1
-levelnumbered:2
-interactive:true

Hari 1 [[Commit Rule]]
	Components
		Header
		Footer
Hari 2
	Tree Diagram
		bagus
	Pull Request
		asdsa
	Blender
		ads
Hari 3
	Tree Diagram
		bagus
	Pull Request
		asdsa
	Blender
		ads
```
````

**Output (Initial):**
```
Project Timeline
(>) 1. Hari 1 [[Commit Rule]]
(>) 2. Hari 2
(>) 3. Hari 3
```

**Output (After clicking Hari 2):**
```
Project Timeline
(>) 1. Hari 1 [[Commit Rule]]
(v) 2. Hari 2
├──(>) 2.1. Tree Diagram
├──(>) 2.2. Pull Request
└──(>) 2.3. Blender
(>) 3. Hari 3
```

---

### Example B: Interactive with Level 0 Start (Collapsible)

**Input:**
````markdown
```tree
-startShowLevel:0
-levelnumbered:2
-interactive:true

Hari 1
	Components
		Header
Hari 2
	Tree Diagram
		bagus
```
````

**Output (Initially Collapsed):**
```
Hari 1, Hari 2 (more)
```

**Output (After clicking "more"):**
```
Hari 1, Hari 2 (less)
(>) 1. Hari 1
(>) 2. Hari 2
```

**Output (After clicking "more" then expanding Hari 1):**
```
Hari 1, Hari 2 (less)
(v) 1. Hari 1
└──(>) 1.1. Components
(>) 2. Hari 2
```

---

### Example C: Interactive with Level 2 Start (Auto-Expanded)

**Input:**
````markdown
```tree
-title:Development Phases
-startShowLevel:2
-levelnumbered:2
-interactive:true

Hari 1
	Components
		Header
		Footer
Hari 2
	Tree Diagram
		bagus
	Pull Request
		asdsa
```
````

**Output (Initial - Auto-expanded to level 2):**
```
Development Phases
(v) 1. Hari 1
└──(>) 1.1. Components
(v) 2. Hari 2
├──(>) 2.1. Tree Diagram
└──(>) 2.2. Pull Request
```

**Output (After clicking Components):**
```
Development Phases
(v) 1. Hari 1
└──(v) 1.1. Components
    ├── Header
    └── Footer
(v) 2. Hari 2
├──(>) 2.1. Tree Diagram
└──(>) 2.2. Pull Request
```

---

### Example D: Static Tree (No Interactive)

**Input:**
````markdown
```tree
-title:Project Structure
-startShowLevel:2
-levelnumbered:2

Hari 1
	Components
		Header
		Footer
Hari 2
	Tree Diagram
		bagus
```
````

**Output (Static - No toggles):**
```
Project Structure
1. Hari 1
└── 1.1. Components
2. Hari 2
└── 2.1. Tree Diagram
```

---

### Example E: Full Tree Static (Level 3)

**Input:**
````markdown
```tree
-startShowLevel:3
-levelnumbered:3

Hari 1
	Components
		Header
		Footer
Hari 2
	Tree Diagram
		bagus
	Pull Request
		asdsa
```
````

**Output (All nodes visible):**
```
1. Hari 1
└── 1.1. Components
    ├── 1.1.1. Header
    └── 1.1.2. Footer
2. Hari 2
├── 2.1. Tree Diagram
│   └── 2.1.1. bagus
└── 2.2. Pull Request
    └── 2.2.1. asdsa
```

---

### Example F: Interactive with Wikilinks

**Input:**
````markdown
```tree
-title:Documentation
-startShowLevel:1
-levelnumbered:1
-interactive:true

Getting Started [[Setup Guide]]
	Installation [[Install|How to Install]]
	Configuration
API Reference [[API Docs]]
	Endpoints
	Authentication
```
````

**Output (Initial):**
```
Documentation
(>) 1. Getting Started [[Setup Guide]]
(>) 2. API Reference [[API Docs]]
```

**Output (After expanding Getting Started):**
```
Documentation
(v) 1. Getting Started [[Setup Guide]]
├──(>) Installation [[How to Install]]
└──(>) Configuration
(>) 2. API Reference [[API Docs]]
```

---

## Feature Combinations Quick Guide

| Flags | Result |
|-------|--------|
| `-interactive:true -startShowLevel:0` | Collapsible with "(more)" link, roots collapsed |
| `-interactive:true -startShowLevel:1` | Roots visible with `(>)`, children hidden |
| `-interactive:true -startShowLevel:2` | Roots + children visible, roots auto-expanded `(v)` |
| `-interactive:false -startShowLevel:2` | Static tree showing 2 levels, no toggles |
| `-levelnumbered:2` | Hierarchical numbering up to 2 levels |
| `-title:Text` | Shows title above tree |
| `-title:Text -startShowLevel:0` | Title with collapsible content |

---

## Combined Examples

### Example 1: Interactive Tree with Auto-Expansion

**Input:**
```tree
-title:Project Structure
-interactive:true
-startShowLevel:2
-levelnumbered:2

Frontend
	Components
		Header
		Footer
	Styles
Backend
	API
	Database
```

**Output (Initial):**
```
Project Structure
(v) 1. Frontend
├──(>) 1.1. Components
└──(>) 1.2. Styles
(v) 2. Backend
├──(>) 2.1. API
└──(>) 2.2. Database
```

**After clicking on "Components":**
```
Project Structure
(v) 1. Frontend
├──(v) 1.1. Components
│   ├── Header
│   └── Footer
└──(>) 1.2. Styles
(v) 2. Backend
├──(>) 2.1. API
└──(>) 2.2. Database
```

---

### Example 2: Static Tree (No Interactive Mode)

**Input:**
```tree
-title:Project Structure
-startShowLevel:3
-levelnumbered:2

Frontend
	Components
		Header
		Footer
	Styles
Backend
	API
	Database
```

**Output:**
```
Project Structure
1. Frontend
├── 1.1. Components
│   ├── Header
│   └── Footer
└── 1.2. Styles
2. Backend
├── 2.1. API
└── 2.2. Database
```

**Behavior:**
- No toggles (interactive mode disabled)
- All nodes up to depth 3 are visible
- Tree is static, cannot collapse/expand

---

### Example 3: Collapsible with Auto-Title

**Input:**
```tree
-interactive:true
-startShowLevel:0

Frontend
	Components
Backend
	API
```

**Output (Initially):**
```
Frontend, Backend (more)
```

**Output (After clicking "more"):**
```
Frontend, Backend (less)
(>) Frontend
(>) Backend
```

---

### Example 4: Static Tree with Numbering

**Input:**
```tree
-levelnumbered:3

Frontend
	Components
		Header
		Footer
	Styles
```

**Output:**
```
1. Frontend
├── 1.1. Components
│   ├── 1.1.1. Header
│   └── 1.1.2. Footer
└── 1.2. Styles
```

---

## Interactive vs Non-Interactive Comparison

| Feature | Interactive Mode (`-interactive:true`) | Non-Interactive Mode (`-interactive:false`) |
|---------|---------------------------------------|---------------------------------------------|
| **Toggles** | ✅ Shows `(v)` and `(>)` for nodes with children | ❌ No toggles shown |
| **User Control** | ✅ User can click to expand/collapse | ❌ Static tree, no interaction |
| **startShowLevel** | Controls initial expansion state | Hard limit on visible depth |
| **Expand Beyond** | ✅ User can expand beyond `startShowLevel` | ❌ Cannot show nodes beyond `startShowLevel` |
| **Use Case** | Large trees, user exploration, dynamic content | Small trees, documentation, static diagrams |
| **Visual** | `(v) Root` or `(>) Root` | `Root` (no indicators) |

---

## Styling

### Toggle Indicators

- **Color:** Theme-aware (black in light theme, near-white in dark theme)
- **Cursor:** Pointer on hover
- **Selectable:** Yes - can be highlighted and copied with Ctrl+C
- **Hover:** Slight opacity change (0.7)
- **Click Behavior:** 
  - Click without selecting → Toggles node expand/collapse
  - Click and drag → Selects text (doesn't toggle)
  - Works with text selection - won't toggle if you're selecting text

### Title Toggle (more/less)

- **Color:** Gray (#666666 in light theme, #999999 in dark theme)
- **Cursor:** Pointer on hover
- **Selectable:** Yes - can be highlighted and copied
- **Hover:** Underline + opacity change (0.7)
- **Click Behavior:** Same as toggle indicators - respects text selection

---

## Technical Details

### Indentation Detection

- Uses **tabs** (not spaces) for depth detection
- Each tab = one level deeper
- Depth 0 (no tabs) = root node

### ASCII Art Characters

- `├──` = Edge (middle child)
- `└──` = Corner (last child)
- `│   ` = Line (vertical continuation)
- `    ` = Blank (no continuation)

### Toggle Format

- Collapsed: `(>)` followed by space
- Expanded: `(v)` followed by space
- Appears directly after branch character: `├──(v) Node`

### Numbering Format

- Hierarchical: `1.`, `1.1.`, `1.1.1.`, etc.
- Appears after toggle (if present): `(v) 1.2.3. Node`
- Space after number: `1. Node` not `1.Node`

---

## Copy Button

- Located at top-right corner
- Copies entire tree diagram as plain text
- **Includes all visible content:** title, trees, toggles `(v)` and `(>)`, numbers, and node names
- **Preserves structure:** ASCII art, indentation, and formatting
- Feedback: "Copied!" → "Copy" after 1.2 seconds

**Two ways to copy:**

1. **Copy Button:** Copies entire visible tree with all toggles
2. **Manual Selection:** Highlight any text (including toggles) and press Ctrl+C / Cmd+C

**Example copied output:**
```
Tree Diagram Plugin Features
(v) 1. Configuration Flags
├──(>) 1.1. Interactive Mode
├──(>) 1.2. Start Show Level
└──(>) 1.3. Level Numbered
(v) 2. Visual Features
├──(>) 2.1. ASCII Art
└──(>) 2.2. Toggle Indicators
```

**Note:** The toggles `(v)` and `(>)` are fully selectable and included in copied text, making it easy to share the current state of your tree diagram.

---

## Backwards Compatibility

The following flag names are supported for backwards compatibility:

- `-expandall:` → Same as `-startShowLevel:`
- `-showlevel:` → Same as `-startShowLevel:`

---

## Success Criteria

- ✅ Interactive toggles work for all nodes with children
- ✅ `startShowLevel` controls initial expansion state
- ✅ Users can expand/collapse beyond `startShowLevel` in interactive mode
- ✅ Hierarchical numbering appears correctly
- ✅ Title with collapsible content works
- ✅ Auto-title generation from root names
- ✅ Multi-root trees render correctly
- ✅ Wikilinks are clickable and navigate correctly
- ✅ Toggles and title links are fully selectable and highlightable
- ✅ Text selection doesn't trigger toggle (smart click detection)
- ✅ Copy button copies entire visible tree with toggles
- ✅ Manual text selection works across entire tree
- ✅ Theme-aware styling (light/dark)

---

## User Experience Features

### Smart Click Detection
- **Click without selection:** Toggles node expand/collapse
- **Click and drag:** Selects text (including toggles)
- **After selecting text:** Click again to toggle
- **Prevents accidental toggles:** Won't toggle while selecting text

### Text Selection
- All text is selectable including `(v)`, `(>)`, `(more)`, `(less)`
- Works with standard keyboard shortcuts (Ctrl+C, Cmd+C)
- Selection works across multiple lines and nodes
- Toggles remain clickable after selection

### Copy Functionality
- **Copy Button:** One-click copy of entire tree
- **Manual Selection:** Highlight specific parts and copy
- Both methods preserve toggles and structure

---

## Future Enhancements

1. **Persist state:** Remember expanded/collapsed state across sessions
2. **Custom toggle text:** Allow customization of `(v)` and `(>)` characters
3. **Keyboard navigation:** Arrow keys to navigate tree
4. **Search/filter:** Filter tree nodes by text
5. **Export formats:** Export to JSON, XML, or other formats
6. **Drag and drop:** Reorder nodes via drag and drop
7. **Context menu:** Right-click menu for node actions


---

## Mobile Support (Planned - v1.1)

The plugin will include comprehensive mobile support to achieve a perfect 100/100 UX score.

### Goals

1. **Touch-Friendly Controls** - All interactive elements meet minimum touch target size (44x44px)
2. **Responsive Layout** - Adapts to narrow screens without horizontal scrolling
3. **Mobile Gestures** - Support swipe gestures for expand/collapse
4. **Performance** - Fast rendering and smooth interactions on mobile devices
5. **Cross-Platform** - Works on iOS Safari, Android Chrome, and tablets

### Target Devices

**Primary:**
- Phones: iPhone (iOS Safari), Android (Chrome)
- Screen sizes: 320px - 428px width
- Orientation: Portrait (primary), Landscape (secondary)

**Secondary:**
- Tablets: iPad, Android tablets
- Screen sizes: 768px - 1024px width
- Orientation: Both portrait and landscape

### UI Design

**Desktop Layout (≥768px):**
```
┌────────────────────────────────────────────────────────┐
│        [🔧] Interactive  Show:|<|2|>|  Num:|<|2|>| [Copy] │
├────────────────────────────────────────────────────────┤
│ My Project Structure                                    │
│ (v) 1. Frontend                                         │
└────────────────────────────────────────────────────────┘
```

**Mobile Layout (<768px) - Bottom Sheet:**
```
┌──────────────────────────┐
│ [⚙️]             [Copy] │ ← Settings icon + Copy
├──────────────────────────┤
│ My Project Structure     │
│ (v) 1. Frontend          │
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

### Features

**1. Touch-Friendly Controls**
- Minimum 44x44px touch targets (WCAG 2.1 Level AAA)
- Visual feedback on touch (scale animation)
- Prevent accidental text selection

**2. Swipe Gestures**
- Swipe right (>50px) → Expand node `(>)` to `(v)`
- Swipe left (>50px) → Collapse node `(v)` to `(>)`
- Vertical swipe → Scroll (no action)
- Short swipe (<50px) → No action (prevents accidental triggers)

**3. Responsive Typography**
- Mobile: 16px font size (larger for readability)
- Desktop: 14px font size
- Mobile: 1.8 line height (more spacing)
- Desktop: 1.6 line height

**4. Responsive Layout**
- No horizontal scrolling on any device
- Compact indentation on mobile (3ch vs 4ch)
- Word wrap for long node names
- Adaptive padding (8px mobile, 16px desktop)

**5. Bottom Sheet UI**
- Native mobile feel
- Smooth slide-up animation
- Overlay with backdrop
- Easy to dismiss (tap outside or close button)

### Implementation Details

**Device Detection:**
```typescript
class MobileDetector {
    static isMobile(): boolean {
        return window.innerWidth < 768;
    }
    
    static isTouchDevice(): boolean {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
}
```

**Touch Event Handling:**
```typescript
class TouchHandler {
    handleTouchStart(e: TouchEvent) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
    }
    
    handleTouchEnd(e: TouchEvent, path: string) {
        const deltaX = e.changedTouches[0].clientX - this.touchStartX;
        const deltaY = e.changedTouches[0].clientY - this.touchStartY;
        
        // Detect swipe (horizontal > vertical && > 50px)
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            if (deltaX > 0) {
                this.expandNode(path); // Swipe right
            } else {
                this.collapseNode(path); // Swipe left
            }
        }
    }
}
```

**Responsive CSS:**
```css
/* Mobile First Approach */
.tree-diagram-container {
    padding: 8px;
    font-size: 16px;
}

.tree-control-button {
    min-width: 44px;
    min-height: 44px;
}

/* Tablet & Desktop (768px+) */
@media (min-width: 768px) {
    .tree-diagram-container {
        padding: 16px;
        font-size: 14px;
    }
    
    .tree-control-button {
        min-width: 36px;
        min-height: 36px;
    }
}

/* Touch feedback */
.tree-control-button:active {
    background-color: var(--background-modifier-hover);
    transform: scale(0.95);
}
```

### Testing Requirements

**Device Testing:**
- iOS: iPhone SE, iPhone 14, iPad
- Android: Small/Medium/Large phones, Tablets
- Browsers: Safari, Chrome, Samsung Internet, Firefox

**Orientation Testing:**
- Portrait mode (primary)
- Landscape mode (secondary)
- Rotation handling (no layout breaks)

**Touch Testing:**
- All buttons are 44x44px minimum
- Swipe gestures work smoothly
- No accidental triggers
- Touch feedback is visible

**Performance Testing:**
- Renders quickly on mobile (<1s)
- Smooth scrolling (60fps)
- No lag when toggling nodes

### Success Criteria

- ✅ All controls meet 44x44px minimum touch target
- ✅ No horizontal scrolling on any mobile device
- ✅ Swipe gestures work reliably
- ✅ Bottom sheet opens smoothly
- ✅ Text is readable without zooming
- ✅ Works on iOS Safari and Android Chrome
- ✅ Performance is smooth (no lag)
- ✅ Layout adapts to portrait and landscape

### Implementation Timeline

**Week 1: Core Mobile Support**
- Responsive control panel (bottom sheet)
- Touch-friendly button sizes (44x44px)
- Responsive typography
- Prevent horizontal scrolling

**Week 2: Touch Interactions**
- Swipe gestures for expand/collapse
- Touch feedback animations
- Bottom sheet implementation

**Week 3: Testing & Polish**
- Test on real devices (iOS + Android)
- Performance optimization
- Bug fixes
- Documentation

**Estimated Effort:** 7 days (Medium difficulty)

---

## Roadmap

### Current Version: v1.0 ✅
- ✅ Basic tree rendering with ASCII art
- ✅ Interactive mode with `(v)` and `(>)` toggles
- ✅ Hierarchical numbering (1., 1.1., 1.1.1.)
- ✅ Title with collapsible content `(more)`/`(less)`
- ✅ Multi-root trees (automatic detection)
- ✅ Wikilink integration `[[target|alias]]`
- ✅ Smart click detection (doesn't toggle while selecting text)
- ✅ Full text selection support (toggles are selectable)
- ✅ Copy button with toggle preservation
- ✅ Theme-aware styling (light/dark)
- ✅ Flags at top or bottom of codeblock

**UX Grade: 97/100** (Excellent)

### Next Version: v1.1 (Mobile Support) 🔨 IN PROGRESS

**Status:** Implementation in progress - Core mobile UI completed, testing pending

**Completed:**
- ✅ Responsive control panel (hamburger dropdown menu)
- ✅ Touch-friendly button sizes (44x44px minimum)
- ✅ Responsive typography (16px mobile, 14px desktop)
- ✅ Mobile-first CSS with breakpoints (768px, 1024px)
- ✅ Touch feedback animations
- ✅ Device detection utilities (`MobileDetector.ts`)
- ✅ Touch gesture handler (`TouchHandler.ts`)
- ✅ Hamburger menu with dropdown controls
- ✅ Spinner controls for show level and numbering
- ✅ Interactive toggle button in control panel

**In Progress:**
- 🔨 Bottom sheet UI (alternative to dropdown)
- 🔨 Swipe gesture integration for tree nodes
- 🔨 Plugin settings for mobile UI preference

**Pending:**
- ⏳ Mobile testing (iOS Safari, Android Chrome)
- ⏳ Performance optimization
- ⏳ Bug fixes and polish

**Target UX Grade: 100/100** (Perfect)

### Future Versions 📋
- **Advanced Features**
  - State persistence (remember expand/collapse)
  - Export formats (JSON, XML, Markdown)
  - Templates (preset tree structures)
  - Custom toggle characters
  - Keyboard shortcuts
  - Enhanced accessibility

- **AI Integration**
  - Auto-generate tree from text
  - Suggest structure improvements
  - Smart node completion
  - Natural language tree creation

---

## Version History

### v1.0.0 (Current)
- Initial release with core features
- Interactive mode, numbering, title support
- Multi-root trees, wikilinks
- Smart text selection
- Theme-aware styling

### v1.1.0 (Planned)
- Mobile support (responsive + touch)
- Swipe gestures
- Bottom sheet UI
- Mobile testing
- **Target: 100/100 UX Grade**
