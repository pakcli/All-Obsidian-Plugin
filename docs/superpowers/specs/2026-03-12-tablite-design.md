# Tablite — Obsidian CSV Editor Plugin

## Overview

A CSV editor plugin for Obsidian that provides an Excel-like editing experience with virtual scrolling for large files, automatic delimiter/encoding detection, and keyboard-driven navigation.

## Tech Stack

| Role | Library |
|---|---|
| UI Framework | Preact + preact/compat |
| Table Engine | @tanstack/react-table |
| Virtual Scrolling | @tanstack/react-virtual |
| CSV Parsing | PapaParse |
| Encoding Detection | jschardet |
| Build | esbuild |

## Architecture

```
src/
├── main.ts              # Obsidian plugin entry, registers CSV file view
├── csv-view.ts           # Obsidian FileView subclass, mounts Preact
├── parser/
│   ├── detect.ts         # Delimiter auto-detection + encoding detection
│   └── csv-engine.ts     # PapaParse wrapper: parse / serialize
├── components/
│   ├── App.tsx           # Root: toolbar + table
│   ├── Toolbar.tsx       # Search, delimiter switch, encoding display
│   ├── Table.tsx         # TanStack Table + Virtual main table
│   ├── Cell.tsx          # Editable cell
│   └── HeaderCell.tsx    # Header: column name edit, sort, resize
├── hooks/
│   ├── useTableData.ts   # Data state: CRUD rows/columns, undo/redo
│   └── useKeyboard.ts    # Keyboard nav: arrows, Tab, Enter, Escape
└── styles.css
```

## Features (v1)

### Core Editing
- Click-to-edit cells, auto-save on blur
- Keyboard navigation: arrow keys, Tab (next col), Enter (next row), Escape (cancel)
- Row/column operations: insert/delete via context menu
- Column width drag-resize
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)

### CSV Format Support
- Auto-detect delimiter (comma, semicolon, tab, pipe)
- Auto-detect encoding (UTF-8, GBK, Latin-1, etc.), manual switch in toolbar
- Preserve original delimiter and encoding on save

### Performance
- Virtual scrolling for rows — smooth at 10k+ rows
- Column virtualization for wide files

### Toolbar
- Global search with cell highlighting
- Column sort (click header)
- Encoding/delimiter display with manual override

## Data Flow

```
CSV File → jschardet detect encoding → TextDecoder decode
→ PapaParse parse (auto-detect delimiter) → 2D array
→ TanStack Table → virtual scroll render

Edit → update 2D array → PapaParse serialize
→ TextEncoder encode → write back to file
```

## Out of Scope (v1)

- Column type system (number/date formatting)
- Multi-sheet
- Formula calculation
- Import/export other formats
