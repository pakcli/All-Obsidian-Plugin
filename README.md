# Tree Diagram Plugin for Obsidian

Render hierarchical tree diagrams from indented text with wikilink support, multiple trees per code block, interactive collapse/expand functionality, and presentation mode.

## Features

### 1. Configuration Flags

Control plugin behavior using inline configuration flags at the start of your code block:

````markdown
```tree
-interactive:true
-expandall:false
-presentationmode:true

Your tree content here...
```
````

**Available Flags:**

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `-interactive:` | `true`/`false` | `false` | Enable node-level collapse/expand |
| `-expandall:` | `true`/`false` | `false` | Start with all nodes expanded |
| `-presentationmode:` | `true`/`false` | `false` | Enable section accordion mode |

### 2. Basic Tree Code Blocks

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

### 3. Interactive Mode

Enable collapsible/expandable trees with the `-interactive:true` flag:

````markdown
```tree
-interactive:true

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
├──(>) Branch 1
└──(>) Branch 2
```

### 4. Expand All Mode

Start with all nodes expanded using `-expandall:true`:

````markdown
```tree
-interactive:true
-expandall:true

Root
	Branch 1
		Leaf 1
		Leaf 2
	Branch 2
		Leaf 3
```
````

All nodes start expanded with `(v)` indicators.

### 5. Presentation Mode

Create section-based accordion with `-presentationmode:true`:

````markdown
```tree
-presentationmode:true

Frontend Architecture
	Components
		Header
		Footer
	Routing
		Routes
		Guards

---

Backend Architecture
	API Layer
		REST Endpoints
		GraphQL
	Database
		Models
		Migrations
```
````

**Section Separators:**
- `---` - New section, collapsed by default
- `---NEXT(v)---` - New section, expanded by default
- `---NEXT(>)---` - New section, collapsed by default (explicit)

**Output:**
```
▼ Frontend Architecture
├── Components
│   ├── Header
│   └── Footer
└── Routing
    ├── Routes
    └── Guards

▶ Backend Architecture
```

Click `▼` or `▶` to toggle section visibility.

### 6. Combined Modes

Combine all features for maximum flexibility:

````markdown
```tree
-interactive:true
-expandall:true
-presentationmode:true

Frontend Architecture
	Components
		Header
		Footer
	Routing
		Routes
		Guards

---NEXT(v)---

Backend Architecture
	API Layer
		REST Endpoints
		GraphQL
	Database
		Models
		Migrations
```
````

**Output:**
```
▼ Frontend Architecture
├──(v) Components
│   ├── Header
│   └── Footer
└──(v) Routing
    ├── Routes
    └── Guards

▼ Backend Architecture
├──(v) API Layer
│   ├── REST Endpoints
│   └── GraphQL
└──(v) Database
    ├── Models
    └── Migrations
```

- **Section level**: `▼`/`▶` controls entire section
- **Node level**: `(v)`/`(>)` controls node children

### 7. Multiple Trees per Code Block

Create multiple independent trees in a single code block:

````markdown
```tree
Project A
	branch a1

Project B
	branch b1
```
````

Any line with depth 0 (no indentation) creates a new tree root.

### 8. Wikilink Support

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
- Works with all modes (basic, interactive, presentation)

### 9. Copy Button

Each rendered tree includes a "Copy" button in the top-right corner to copy the ASCII tree to your clipboard.

### 10. Vault Structure Commands

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

### Example 2: Interactive Tree

````markdown
```tree
-interactive:true

My Project
	src
		main.ts
		utils.ts
	docs
		README.md
```
````

### Example 3: Presentation Mode

````markdown
```tree
-presentationmode:true

Frontend
	React Components
	Styles

---

Backend
	API Routes
	Database
```
````

### Example 4: All Features

````markdown
```tree
-interactive:true
-expandall:true
-presentationmode:true

Frontend
	[[React Components]]
		Header
		Footer
	Styles

---NEXT(v)---

Backend
	[[API Routes]]
		Users
		Posts
	[[Database]]
```
````

## Syntax Reference

### Configuration Flags

Place at the start of the code block, one per line:
```
-interactive:true
-expandall:false
-presentationmode:true
```

### Tree Syntax

- **Indentation**: Use tabs for hierarchy
- **Multi-root**: Multiple depth-0 nodes create separate trees
- **Wikilinks**: Use `[[note]]` or `[[note\|alias]]` syntax
- **Section separators**: `---`, `---NEXT(v)---`, `---NEXT(>)---`

### Indicators

- **Node level**: `(v)` expanded, `(>)` collapsed
- **Section level**: `▼` expanded, `▶` collapsed

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css`
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
