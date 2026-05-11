# Tree Diagram Plugin - Test Examples

This file contains examples to test all features of the Tree Diagram plugin.

## Test 1: Basic Single Tree (Backwards Compatibility)

```tree
Project Root
	src
		main.ts
		utils.ts
	docs
		README.md
	tests
		unit
		integration
```

**Expected**: Standard ASCII tree with no interactive features.

---

## Test 2: Multi-Root Trees

```tree
Frontend
	Components
		Header
		Footer
		Sidebar
	Styles
		CSS
		SCSS

Backend
	API
		Routes
		Controllers
	Database
		Models
		Migrations
```

**Expected**: Two separate trees with "Frontend" and "Backend" as roots, separated by a blank line.

---

## Test 3: Interactive Tree (Collapsed by Default)

```tree-interactive
Application
	Frontend
		React Components
			Header
			Footer
		Redux Store
			Actions
			Reducers
	Backend
		Express Server
		Database
	DevOps
		Docker
		CI/CD
```

**Expected**: 
- Nodes with children show `(>)` indicator (collapsed)
- Clicking `(>)` expands to `(v)` and shows children
- Leaf nodes have no indicator

---

## Test 4: Interactive Tree (Expanded by Default)

```tree-interactive-expandall
Application
	Frontend
		React Components
			Header
			Footer
		Redux Store
			Actions
			Reducers
	Backend
		Express Server
		Database
	DevOps
		Docker
		CI/CD
```

**Expected**:
- All nodes with children show `(v)` indicator (expanded)
- All children visible initially
- Clicking `(v)` collapses to `(>)` and hides children

---

## Test 5: Multi-Root Interactive Tree

```tree-interactive
Team Alpha
	Sprint 1
		Task 1
		Task 2
	Sprint 2
		Task 3
		Task 4

Team Beta
	Sprint 1
		Task A
		Task B
	Sprint 2
		Task C
```

**Expected**:
- Two interactive trees
- Each tree has independent expand/collapse state
- Blank line separator between trees

---

## Test 6: Tree with Wikilinks (Basic)

```tree
Project Documentation
	[[Overview]]
	[[Architecture|System Architecture]]
	Implementation
		[[Frontend Guide]]
		[[Backend Guide]]
	[[Testing Strategy]]
```

**Expected**:
- Wikilinks are clickable
- `[[Overview]]` displays as "Overview"
- `[[Architecture|System Architecture]]` displays as "System Architecture"
- Clicking links navigates to those notes

---

## Test 7: Interactive Tree with Wikilinks

```tree-interactive-expandall
[[Project Root]]
	[[Phase 1 - Planning]]
		[[Requirements Document]]
		[[Design Specifications]]
	[[Phase 2 - Development]]
		[[Sprint 1]]
			[[User Authentication]]
			[[Database Schema]]
		[[Sprint 2]]
			[[API Endpoints]]
			[[Frontend Components]]
	[[Phase 3 - Testing]]
		[[Test Plan]]
		[[QA Checklist]]
```

**Expected**:
- Interactive indicators work
- Wikilinks remain clickable
- Clicking indicator toggles children
- Clicking wikilink navigates to note

---

## Test 8: Multi-Root with Mixed Content

```tree
Documentation
	[[Getting Started]]
	[[API Reference]]
		Authentication
		Endpoints
	[[Examples]]

Source Code
	src
		main.ts
		[[utils.ts|Utilities]]
	tests
		unit.test.ts
```

**Expected**:
- Two trees with different content types
- Wikilinks work in both trees
- Standard ASCII rendering

---

## Test 9: Deep Nesting (Interactive)

```tree-interactive-expandall
Level 0
	Level 1
		Level 2
			Level 3
				Level 4
					Level 5
						Level 6
```

**Expected**:
- Deep nesting renders correctly
- All levels initially expanded
- Can collapse any level
- Indentation preserved

---

## Test 10: Wide Tree (Many Children)

```tree-interactive
Root
	Child 1
	Child 2
	Child 3
	Child 4
	Child 5
	Child 6
	Child 7
	Child 8
	Child 9
	Child 10
```

**Expected**:
- All children listed correctly
- Last child uses `└──` (corner)
- Others use `├──` (edge)
- Interactive toggle works

---

## Test 11: Complex Multi-Root Interactive

```tree-interactive-expandall
Web Application
	[[Frontend]]
		React
			Components
				[[Header Component]]
				[[Footer Component]]
			Hooks
				[[useAuth]]
				[[useData]]
		Styling
			CSS Modules
			Tailwind
	[[Backend]]
		Node.js
			Express
			Middleware
		Database
			PostgreSQL
			Redis

Mobile Application
	[[React Native]]
		Screens
			Home
			Profile
		Navigation
			Stack Navigator
			Tab Navigator
	[[Native Modules]]
		Camera
		Location
```

**Expected**:
- Two complex trees
- All nodes expanded initially
- Wikilinks clickable
- Independent state per tree
- Proper indentation and ASCII art

---

## Test 12: Empty and Edge Cases

```tree
Empty Tree
```

```tree
Single Node
```

```tree-interactive
Just Root
```

**Expected**:
- Single node trees render correctly
- No errors or crashes
- Interactive mode handles single nodes

---

## Test 13: Copy Button Test

Use any tree above and:
1. Click the "Copy" button
2. Paste into a text editor
3. Verify ASCII art is preserved
4. Verify wikilink syntax is preserved (not HTML)

**Expected**:
- Button shows "Copied!" on success
- Plain text copied (no HTML)
- ASCII characters preserved

---

## Test 14: Vault Commands Test

1. Open Command Palette (Ctrl/Cmd + P)
2. Run "Copy vault tree source (folders + files)"
3. Paste into a tree code block
4. Verify it renders correctly

**Expected**:
- Tab-indented text generated
- Renders as proper tree
- All folders and files included

---

## Notes for Manual Testing

### Visual Checks
- [ ] ASCII art alignment is correct
- [ ] Interactive indicators are visible and styled
- [ ] Wikilinks are colored/styled as links
- [ ] Copy button is positioned correctly
- [ ] Blank lines separate multi-root trees

### Interaction Checks
- [ ] Clicking `(v)` collapses node
- [ ] Clicking `(>)` expands node
- [ ] Wikilinks navigate correctly
- [ ] Copy button works
- [ ] State persists during interactions (until reload)

### Edge Case Checks
- [ ] Very deep trees (10+ levels)
- [ ] Very wide trees (50+ children)
- [ ] Mixed wikilinks and plain text
- [ ] Empty lines in source
- [ ] Special characters in node names

### Performance Checks
- [ ] Large trees render quickly
- [ ] Toggle response is instant
- [ ] No lag with multiple trees
- [ ] Copy works with large trees
