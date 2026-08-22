# PakCLI Suite

[![GitHub release](https://img.shields.io/github/v/release/pakcli/All-Obsidian-Plugin?style=flat-square&color=blue)](https://github.com/pakcli/All-Obsidian-Plugin/releases)
[![Obsidian Minimum Version](https://img.shields.io/badge/Obsidian-1.8.0+-purple.svg?style=flat-square)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Platform: Desktop Only](https://img.shields.io/badge/Platform-Desktop_Only-orange.svg?style=flat-square)](https://obsidian.md)

**PakCLI Suite** is the all-in-one modular power plugin for [Obsidian](https://obsidian.md). 

It supercharges your note-taking environment into an integrated development, data analysis, and media management workspace on your local computer. Whether you are querying databases with SQL, editing CSV/TSV spreadsheets with virtualized grids, two-way syncing script files, capturing YouTube evidence clips, generating directory tree diagrams, or dragging attachments directly into ChatGPT & Claude, PakCLI Suite provides high-performance native tools without relying on cloud services.

---

## 🧩 Module Overview Table

| Module Name | Settings Tab | Primary Function | Key Highlights |
| :--- | :--- | :--- | :--- |
| **Codeblock Sync** | `Codeblock Sync` | Two-way sync between Markdown codeblocks and disk script files | Diff viewer, script runner with output drawer, auto subfolder mirroring, bulk dashboard |
| **SQLSeal & Tablite** | `SQLSeal & Tablite` | Embedded SQLite engine & full virtualized CSV table editor | Real-time SQL queries, TanStack virtual grid, multi-row & column drag-and-drop, YouTube thumbnail cache, Find & Replace (`Ctrl+F`), undo/redo |
| **Leaflet Map** | `Leaflet Map` | Interactive geospatial and custom world maps | Coordinates, pins, GeoJSON layers, distance measurement, multi-layer map rendering |
| **Docmost Sync** | `Docmost Sync` | Workspace sync with Docmost open-source wiki over HTTP | Push/pull space notes, workspace token authentication, conflict detection |
| **YT Extension** | `YT Extension` | YouTube video timestamp capture & evidence clipping | High-resolution frame capture, video segment looping, transcript sync, local vault caching |
| **Asset Router** | `Asset Router` | Smart attachment routing & file organization | Centralized folder routing, custom regex folder rules, auto subfolder mirroring, YAML title matching |
| **Tree Diagram** | Codeblock (`tree`) | Visual ASCII & SVG directory tree diagram generator | Dynamic tree diagrams, interactive navigation table modes, ASCII directory visualization, 1-click folder scaffold generator |
| **Symlink Manager** | `Symlink Manager` | Filesystem symbolic links & folder junction management | Native directory symlinks, color-coded link badges, path resolution on Windows/macOS/Linux |
| **Codeblock Scaler** | `Codeblock Mode` | Intelligent codeblock text scaler and formatter | ASCII diagram auto-fit (`scalefit`), word wrap, and individual slider horizontal scrolling (`flowclip`) |
| **Date Picker** | `Date Picker` | Natural date selector and timestamp inserter | Calendar popup modal, format presets, `Ctrl+D` shortcut trigger |
| **Asset Draggable** | `Asset Draggable` | Drag attachments directly into AI tools (ChatGPT/Claude) | Native OS file drag-and-drop, Chromium `DownloadURL` payload, 1-click clipboard image copying |

---

## 🌟 Detailed Features

### 1. SQLSeal & Tablite CSV Editor
* **Interactive Spreadsheet View**: View and edit CSV/TSV files with TanStack virtualized grid rendering (smooth 60fps on 100,000+ rows).
* **Multi-Row & Column Drag-and-Drop**: Drag column headers or single/multi-selected rows with instant visual insertion indicators and confirmation dialogs.
* **YouTube Thumbnail Cache**: Automatically detects `yt-url` or `url` columns, renders high-res thumbnail previews, and caches them locally in your vault.
* **Find & Replace (`Ctrl+F`)**: Integrated search bar with match counts, Next/Previous jumping, and bulk cell replacement.
* **Full Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)**: Complete state history tracking for cell edits, row deletions, column moves, and bulk operations.
* **Embedded SQLite (`wa-sqlite`)**: Execute complex SQL queries directly against vault files or Markdown tables inside codeblocks.
* **Receipt Scanner**: Extract and categorize receipts into tabular finance entries.

### 2. Codeblock Sync & Runner
* **Two-Way File Mirroring**: Automatically mirrors codeblocks in Markdown notes to target script files on disk (PowerShell, Bash, Python, JavaScript, TypeScript, Batch).
* **Inline Script Execution**: Execute scripts directly from the note and view stdout, stderr, and exit codes in an expandable drawer.
* **Diff Viewer & Merge Modal**: Compare note code with disk scripts side-by-side with color-coded diff highlights before syncing.
* **Bulk Sync Dashboard**: 1-click scanning modal to synchronize all modified scripts across your entire vault.

### 3. Asset Draggable & AI Exporter
* **Direct Drag to Web Apps**: Grab any embedded image, audio, or video inside Obsidian and drag it directly into ChatGPT, Claude, Google Drive, Gmail, or Windows Explorer.
* **Multi-Format Payloads**: Injects native Electron `startDrag`, Chromium `DownloadURL`, and `text/uri-list` simultaneously for maximum compatibility.
* **1-Click Clipboard Copy**: Right-click any image or attachment embed to copy native bitmap data to your clipboard.

### 4. YouTube Evidence Capture
* **Timestamped Evidence Clips**: Capture high-resolution video frames and clip loops with start/end timestamps.
* **Subtitle & Transcript Sync**: Automatically downloads and formats subtitles matching the selected time range into Markdown notes.
* **Zip Export**: Bundle video clips, thumbnails, transcripts, and metadata into a shareable `.zip` archive.

### 5. Leaflet Map Views
* **Interactive World & Fantasy Maps**: Embed interactive Leaflet maps with custom tile layers, markers, and shapes.
* **Measurement & Coordinates**: Measure polygon areas, path distances, or copy precise coordinates.
* **Iconify Marker Sets**: Style pins using hundreds of Iconify icon packs.

### 6. Symlink Manager & Date Picker
* **Filesystem Symlinks & Junctions**: Create and manage folder junctions between vault folders and external disk directories.
* **Explorer Badges**: Live color-coded status badges (Green = Junction, Orange = Symlink, Red = Broken Link).
* **Fast Date Picker (`Ctrl+D`)**: Quick modal popup to insert formatted timestamps into any active note or filename input.

### 7. Asset Router
* **Centralized Asset Routing**: Automatically routes pasted/dragged images and files into a designated global asset folder (e.g. `assets/` or `attachments/`).
* **Custom Folder Rules**: Set up path-specific rules to organize attachments based on note location or file extensions.
* **Auto Subfolder Mirroring**: Replicate parent note folder hierarchies automatically inside asset directories.
* **YAML Frontmatter Title Matching**: Clean up link paths and match attachment filenames by note title properties automatically.

### 8. Tree Diagram Generator
* **Visual Directory Tree**: Render ASCII and SVG hierarchy tree diagrams from indent-based text or actual folder structures.
* **Interactive Table & Breadcrumb Modes**: Switch between full table view and interactive folder-navigation modes.
* **Scaffold Files & Folders**: 1-click generation of real files and folders in your vault directly from a tree diagram text outline.
* **Codeblock Integration**: Use ````tree ... ```` codeblocks with live re-rendering.

### 9. Docmost Sync
* **Bi-Directional Wiki Sync**: Push and pull notes between Obsidian and a self-hosted Docmost open-source wiki workspace.
* **Space-Level Mapping**: Map specific vault folders to individual Docmost spaces.
* **Conflict Detection**: Prevent overwriting concurrent edits with timestamp-based conflict warnings.

### 10. Codeblock Scaler
* **`scalefit` (ASCII SVG Auto-Fit)**: Renders ASCII diagrams as scalable vector SVGs that fit 100% container width with zero text wrapping.
* **`flowclip`**: Keeps each codeblock as an independent horizontal slider with smooth touch/wheel panning.
* **`wrap`**: Wraps long lines neatly for clean reading view.

---

## ⌨️ Default Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl + D` / `Cmd + D` | Open Date Picker Modal | Global / Note Editor / Explorer Rename |
| `Ctrl + F` / `Cmd + F` | Toggle Find & Replace Bar | Tablite CSV View |
| `Ctrl + Z` / `Cmd + Z` | Undo Last Edit | Tablite CSV View |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo Edit | Tablite CSV View |
| `Shift + Click` | Range Select Rows | Tablite CSV View |

---

## 🛠️ Development & Building

### Prerequisites
- Node.js 20+ (Node 22 LTS recommended)
- npm

### Install Dependencies
```bash
npm install --legacy-peer-deps
```

### Dev Mode (Watch)
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Linting & Validation
```bash
npm run lint
```

---

## 📦 Deployment & Publishing

To build and deploy directly to your local Obsidian vault:
```powershell
./start_plugin_build.ps1
```

To bump version, tag, and publish to GitHub Releases:
```powershell
./start_plugin_publish.ps1
```

---

## 📄 License

MIT License © 2026 PakCLI Team.
