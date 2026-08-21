---
title: "SQLSeal & Tablite"
---

# Feature: SQLSeal & Tablite (CSV / TSV Table Editor)

**SQLSeal & Tablite** provides two integrated database capabilities in your [[obsidian|Obsidian]] vault:
1. **Embedded SQL Database Engine**: Run [[real time sql queries|real-time SQL queries]] powered by an embedded [[sqlite|SQLite]] engine directly against [[markdown|Markdown]] frontmatter, tables, and [[csv and tsv|CSV and TSV]] files.
2. **Tablite CSV & TSV Spreadsheet Editor**: An interactive virtualized grid editor for reading and modifying [[csv and tsv|CSV and TSV]] tabular data files.

---

## 📊 Tablite CSV Table Editor

Opening any `.csv` or `.tsv` file in [[obsidian|Obsidian]] opens the Tablite editor interface:

### Key Features:
- **Virtualized Grid (TanStack)**: Utilize a [[tanstack virtual grid|TanStack virtual grid]] for smooth 60fps scrolling across 10,000+ rows by rendering only visible DOM elements.
- **In-Place Cell Editing**: Double-click or press Enter on any cell to perform [[cell editing|cell editing]]. Automatically writes changes back to disk.
- **Top Toolbar**:
  - **Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z`)**: Complete edit history.
  - **Delimiter Switcher**: Toggle between Comma (`,`), Tab (`\t`), Semicolon (`;`), and Pipe (`|`) for [[csv and tsv|CSV and TSV]] files.
  - **Encoding Switcher**: Auto-detects and supports UTF-8, GBK, Windows-1252, and Shift-JIS.
  - **Column Freezing & Resizing**: Perform [[column freeze|column freeze]] on up to 4 columns on the left and drag column boundaries to resize.
  - **Column Visibility**: Hide or reorder columns via the Columns dropdown.
  - **Live Search**: Search text across all cells with match counters and navigation (`↑` / `↓`).

---

## 🔍 SQL Queries (SQLSeal Engine)

Run [[real time sql queries|real-time SQL queries]] directly inside your notes using ```` ```sql ```` or ```` ```sqlseal ```` codeblocks via [[sqlite|SQLite]]:

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
- **Markdown Table**: Auto-generates standard [[markdown|Markdown]] table syntax.

---

## ⚙️ Configuration (Settings → PakCLI Suite → SQLSeal & Tablite)

- **Default View**: Choose default output rendering (`Grid`, `HTML Table`, or `Markdown Table`).
- **Items per page**: Set pagination page size (`20`, `50`, `100`, `200`, `500`, `1000`) or choose **`Unlimited (All / Virtualized)`** for unpaginated lazy-loaded infinite scrolling via [[tanstack virtual grid|TanStack virtual grid]].
