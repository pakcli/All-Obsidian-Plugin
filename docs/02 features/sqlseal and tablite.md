---
title: "SQLSeal & Tablite"
---

# Feature: SQLSeal & Tablite (CSV / TSV Table Editor)

**SQLSeal & Tablite** provides two integrated database capabilities in your Obsidian vault:
1. **Embedded SQL Database Engine**: Run SQL queries directly against markdown frontmatter, tables, and CSV files in your vault.
2. **Tablite CSV & TSV Spreadsheet Editor**: An interactive virtualized grid editor for reading and modifying tabular data files.

---

## 📊 Tablite CSV Table Editor

Opening any `.csv` or `.tsv` file in Obsidian opens the Tablite editor interface:

### Key Features:
- **Virtualized Grid (TanStack)**: Smooth 60fps scrolling across 10,000+ rows by rendering only visible DOM elements.
- **In-Place Cell Editing**: Double-click or press Enter on any cell to edit. Automatically writes changes back to disk.
- **Top Toolbar**:
  - **Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z`)**: Complete edit history.
  - **Delimiter Switcher**: Toggle between Comma (`,`), Tab (`\t`), Semicolon (`;`), and Pipe (`|`).
  - **Encoding Switcher**: Auto-detects and supports UTF-8, GBK, Windows-1252, and Shift-JIS.
  - **Column Freezing & Resizing**: Freeze up to 4 columns on the left and drag column boundaries to resize.
  - **Column Visibility**: Hide or reorder columns via the Columns dropdown.
  - **Live Search**: Search text across all cells with match counters and navigation (`↑` / `↓`).

---

## 🔍 SQL Queries (SQLSeal Engine)

Run SQL queries directly inside your notes using ```` ```sql ```` or ```` ```sqlseal ```` codeblocks:

````markdown
```sql
SELECT file.name, file.mtime, tags
FROM notes
WHERE tags LIKE '%project%'
ORDER BY file.mtime DESC
LIMIT 10
```
````

### Supported Views:
- **Grid**: Interactive AG-Grid table with sortable and filterable headers.
- **HTML Table**: Clean responsive HTML table.
- **Markdown Table**: Auto-generates standard markdown table syntax.

---

## ⚙️ Configuration (Settings → PakCLI Suite → SQLSeal & Tablite)

- **Default View**: Choose default output rendering (`Grid`, `HTML Table`, or `Markdown Table`).
- **Items per page**: Set pagination page size (`20`, `50`, `100`, `200`, `500`, `1000`) or choose **`Unlimited (All / Virtualized)`** for unpaginated lazy-loaded infinite scrolling.
