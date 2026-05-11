# Tree Diagram Plugin for Obsidian

Render hierarchical tree diagrams from indented text with wikilink support, multiple trees per code block, and interactive collapse/expand functionality.

## Features

### 1. Basic Tree Code Blocks

Create tree diagrams using code blocks with the `tree` language identifier:

````markdown
```tree
Root
	Child 1
	Child 2
		Grandchild 1
		Grandchild 2
	Child 3
```
````

This renders as:

```
Root
├── Child 1
├── Child 2
│   ├── Grandchild 1
│   └── Grandchild 2
└── Child 3
```

### 2. Multiple Trees per Code Block

Create multiple independent trees in a single code block by having multiple root-level nodes (no indentation):

````markdown
```tree
Project A
	Design
		Wireframes
		Mockups
	Development
		Frontend
		Backend

Project B
	Planning
	Execution
	Review
```
````

This renders as:

```
Project A
├── Design
│   ├── Wireframes
│   └── Mockups
└── Development
    ├── Frontend
    └── Backend

Project B
├── Planning
├── Execution
└── Review
```

### 3. Interactive Mode

Enable collapsible/expandable trees with the `tree-interactive` language identifier:

````markdown
```tree-interactive
Root
	Branch 1
		Leaf 1
		Leaf 2
	Branch 2
		Leaf 3
```
````

This renders with interactive indicators:
- **(v)** = Expanded (children visible) - click to collapse
- **(>)** = Collapsed (children hidden) - click to expand

```
Root
├──(v) Branch 1
│   ├── Leaf 1
│   └── Leaf 2
└──(>) Branch 2
```

Click on `(v)` or `(>)` to toggle the visibility of child nodes.

### 4. Interactive with Expand All

Start with all nodes expanded using `tree-interactive-expandall`:

````markdown
```tree-interactive-expandall
Root
	Branch 1
		Leaf 1
		Leaf 2
	Branch 2
		Leaf 3
```
````

All nodes start expanded with `(v)` indicators, and you can collapse them as needed.

### 5. Wikilink Support

Add clickable wikilinks to your tree nodes:

````markdown
```tree
Project
	[[Design Document]]
	[[Implementation|Code]]
	Tasks
		[[Task 1]]
		[[Task 2]]
```
````

- Use `[[target]]` for simple links
- Use `[[target|alias]]` for links with custom display text
- Click any link to navigate to that note
- Works with all tree modes (basic, multi-root, interactive)

### 6. Copy Button

Each rendered tree includes a "Copy" button in the top-right corner to copy the ASCII tree to your clipboard.

### 7. Vault Structure Commands

Generate tree source text from your vault structure:

- **Copy vault tree source (folders + files)**: Generate a tree of your entire vault including all files
- **Copy vault tree source (folders only)**: Generate a tree showing only folders
- **Copy current note folder source tree**: Generate a tree of the current note's parent folder

Access these commands via the Command Palette (Ctrl/Cmd + P).

## Usage Examples

### Example 1: Simple Tree

````markdown
```tree
My Project
	src
		main.ts
		utils.ts
	docs
		README.md
```
````

### Example 2: Multi-Root Tree

````markdown
```tree
Frontend
	React Components
		Header
		Footer
	Styles
		CSS
		SCSS

Backend
	API Routes
		Users
		Posts
	Database
		Models
		Migrations
```
````

### Example 3: Interactive Tree with Wikilinks

````markdown
```tree-interactive
[[Project Overview]]
	[[Phase 1 - Planning]]
		[[Requirements]]
		[[Design]]
	[[Phase 2 - Development]]
		[[Sprint 1]]
		[[Sprint 2]]
	[[Phase 3 - Testing]]
```
````

### Example 4: Multi-Root Interactive Tree

````markdown
```tree-interactive-expandall
Team A Tasks
	[[Task 1]]
		Subtask 1.1
		Subtask 1.2
	[[Task 2]]

Team B Tasks
	[[Task 3]]
		Subtask 3.1
	[[Task 4]]
```
````

## Syntax Reference

### Code Block Types

| Syntax | Description |
|--------|-------------|
| ````tree```` | Basic tree diagram |
| ````tree-interactive```` | Interactive tree with collapse/expand |
| ````tree-interactive-expandall```` | Interactive tree, all nodes expanded by default |

### Tree Syntax

- **Indentation**: Use tabs or double-spaces for hierarchy
- **Multi-root**: Multiple root-level nodes (depth 0) create separate trees
- **Wikilinks**: Use `[[note]]` or `[[note\|alias]]` syntax
- **Interactive indicators**: Automatically added in interactive mode
  - `(v)` = Expanded
  - `(>)` = Collapsed

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` (if present)
2. Create a folder named `tree-diagram` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the `tree-diagram` folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community plugins

### From Community Plugins (when available)

1. Open Settings → Community plugins
2. Search for "Tree Diagram"
3. Click Install, then Enable

## Development

### Building the Plugin

```bash
npm install
npm run build
```

### Development Mode

```bash
npm run dev
```

This will watch for changes and rebuild automatically.

## License

MIT

## Support

If you find this plugin useful, consider supporting the development:
- Report issues on [GitHub](https://github.com/limpido/obsidian-tree-diagram)
- Contribute improvements via pull requests
