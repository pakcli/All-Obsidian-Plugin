# Tablite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that opens CSV files in an Excel-like table editor with virtual scrolling, auto encoding/delimiter detection, and keyboard navigation.

**Architecture:** Preact renders inside Obsidian's TextFileView. TanStack Table manages table state (sorting, columns). TanStack Virtual handles row virtualization. PapaParse parses/serializes CSV. jschardet detects encoding.

**Tech Stack:** Preact, @tanstack/react-table, @tanstack/react-virtual, PapaParse, jschardet, esbuild, TypeScript

---

## File Structure

```
tablite/
├── src/
│   ├── main.ts              # Plugin entry: register view + extensions
│   ├── csv-view.ts           # TextFileView subclass: mount/unmount Preact
│   ├── parser/
│   │   ├── detect.ts         # Detect delimiter + encoding from raw bytes
│   │   └── csv-engine.ts     # PapaParse wrap: parse(string) → string[][], serialize(string[][]) → string
│   ├── components/
│   │   ├── App.tsx           # Root: holds state, renders Toolbar + Table
│   │   ├── Toolbar.tsx       # Search input, delimiter/encoding selectors
│   │   ├── Table.tsx         # TanStack Table + Virtual, sticky header, row virtualization
│   │   ├── Cell.tsx          # Click-to-edit cell with blur-save
│   │   └── HeaderCell.tsx    # Column header: name, sort toggle, resize handle
│   ├── hooks/
│   │   ├── useTableData.ts   # Data CRUD: edit cell, insert/delete row/col, undo/redo
│   │   └── useKeyboard.ts    # Arrow/Tab/Enter/Escape navigation
│   └── styles.css            # All styles
├── manifest.json             # Obsidian plugin manifest
├── package.json
├── tsconfig.json
└── esbuild.config.mjs        # Build script
```

---

## Chunk 1: Project Scaffolding + CSV Parsing

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "tablite",
  "version": "0.1.0",
  "description": "Obsidian CSV editor with virtual scrolling",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "esbuild": "^0.20.0",
    "obsidian": "latest",
    "typescript": "^5.3.0"
  },
  "dependencies": {
    "preact": "^10.19.0",
    "@preact/compat": "^17.1.0",
    "@tanstack/react-table": "^8.11.0",
    "@tanstack/react-virtual": "^3.1.0",
    "papaparse": "^5.4.1",
    "@types/papaparse": "^5.3.14",
    "jschardet": "^3.1.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noImplicitAny": true,
    "outDir": "./dist",
    "sourceMap": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "paths": {
      "react": ["./node_modules/preact/compat"],
      "react-dom": ["./node_modules/preact/compat"],
      "react/jsx-runtime": ["./node_modules/preact/jsx-runtime"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create esbuild.config.mjs**

```javascript
import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  alias: {
    "react": "preact/compat",
    "react-dom": "preact/compat",
    "react/jsx-runtime": "preact/jsx-runtime",
  },
  define: {
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 4: Create manifest.json**

```json
{
  "id": "tablite",
  "name": "Tablite",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "A fast CSV editor with virtual scrolling and auto encoding detection",
  "author": "laofahai",
  "authorUrl": "https://github.com/laofahai",
  "isDesktopOnly": false
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
main.js
*.map
.DS_Store
```

- [ ] **Step 6: Install dependencies**

Run: `cd ~/workspace/tablite && npm install`
Expected: node_modules created, no errors

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json esbuild.config.mjs manifest.json .gitignore
git commit -m "chore: scaffold project with preact + tanstack + papaparse"
```

---

### Task 2: CSV parsing engine

**Files:**
- Create: `src/parser/detect.ts`
- Create: `src/parser/csv-engine.ts`

- [ ] **Step 1: Create detect.ts — encoding + delimiter detection**

```typescript
import jschardet from "jschardet";

export interface DetectResult {
  encoding: string;
  delimiter: string;
}

const DELIMITERS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

export function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const result = jschardet.detect(Buffer.from(bytes));
  // Normalize encoding name
  const enc = (result.encoding || "utf-8").toLowerCase();
  if (enc.includes("utf-8") || enc === "ascii") return "utf-8";
  if (enc.includes("gb") || enc.includes("gb2312") || enc.includes("gbk"))
    return "gbk";
  if (enc.includes("latin") || enc.includes("iso-8859") || enc.includes("windows-1252"))
    return "windows-1252";
  if (enc.includes("shift_jis") || enc.includes("shift-jis"))
    return "shift_jis";
  return enc;
}

export function detectDelimiter(text: string): Delimiter {
  // Take first 10 lines for detection
  const lines = text.split("\n").slice(0, 10);
  const sample = lines.join("\n");

  let best: Delimiter = ",";
  let bestScore = 0;

  for (const d of DELIMITERS) {
    // Count occurrences per line, check consistency
    const counts = lines
      .filter((l) => l.trim().length > 0)
      .map((l) => l.split(d).length - 1);
    if (counts.length === 0) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    // Consistency: low variance + high count = good delimiter
    const variance =
      counts.reduce((a, c) => a + (c - avg) ** 2, 0) / counts.length;
    const score = avg > 0 ? avg / (1 + variance) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function detect(buffer: ArrayBuffer): DetectResult {
  const encoding = detectEncoding(buffer);
  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(buffer);
  const delimiter = detectDelimiter(text);
  return { encoding, delimiter };
}
```

- [ ] **Step 2: Create csv-engine.ts — parse/serialize wrapper**

```typescript
import Papa from "papaparse";
import type { Delimiter } from "./detect";

export interface ParseResult {
  data: string[][];
  headers: string[];
}

export function parseCSV(text: string, delimiter: string): ParseResult {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
  });

  const data = result.data;
  if (data.length === 0) {
    return { headers: [], data: [] };
  }

  // First row as headers
  const headers = data[0];
  const rows = data.slice(1);

  // Normalize: ensure all rows have same column count
  const colCount = headers.length;
  const normalized = rows.map((row) => {
    if (row.length < colCount) {
      return [...row, ...new Array(colCount - row.length).fill("")];
    }
    return row.slice(0, colCount);
  });

  return { headers, data: normalized };
}

export function serializeCSV(
  headers: string[],
  data: string[][],
  delimiter: string,
): string {
  const allRows = [headers, ...data];
  return Papa.unparse(allRows, {
    delimiter,
    newline: "\n",
  });
}
```

- [ ] **Step 3: Verify build compiles**

Run: `cd ~/workspace/tablite && mkdir -p src/parser && npx tsc --noEmit`
Expected: No type errors (after creating placeholder main.ts)

- [ ] **Step 4: Commit**

```bash
git add src/parser/
git commit -m "feat: add CSV parser with encoding and delimiter auto-detection"
```

---

## Chunk 2: Obsidian Plugin Shell + Preact Mount

### Task 3: Plugin entry and TextFileView

**Files:**
- Create: `src/main.ts`
- Create: `src/csv-view.ts`
- Create: `src/components/App.tsx`

- [ ] **Step 1: Create main.ts — plugin entry**

```typescript
import { Plugin } from "obsidian";
import { CsvView, CSV_VIEW_TYPE } from "./csv-view";

export default class TablitePlugin extends Plugin {
  async onload() {
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf));
    this.registerExtensions(["csv", "tsv"], CSV_VIEW_TYPE);
  }

  async onunload() {}
}
```

- [ ] **Step 2: Create csv-view.ts — TextFileView subclass that mounts Preact**

```typescript
import { TextFileView, WorkspaceLeaf } from "obsidian";
import { render } from "preact";
import { h } from "preact";
import { App } from "./components/App";

export const CSV_VIEW_TYPE = "tablite-csv-view";

export class CsvView extends TextFileView {
  private rootEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "CSV";
  }

  getIcon(): string {
    return "table";
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string, clear: boolean): void {
    this.data = data;
    this.renderApp();
  }

  clear(): void {
    this.data = "";
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: "tablite-root" });
  }

  async onClose(): Promise<void> {
    if (this.rootEl) {
      render(null, this.rootEl);
    }
  }

  private renderApp(): void {
    if (!this.rootEl) return;
    render(
      h(App, {
        initialData: this.data,
        filePath: this.file?.path ?? "",
        onDataChange: (newData: string) => {
          this.data = newData;
          this.requestSave();
        },
      }),
      this.rootEl,
    );
  }
}
```

- [ ] **Step 3: Create minimal App.tsx placeholder**

```tsx
import { useEffect, useState } from "preact/hooks";

interface AppProps {
  initialData: string;
  filePath: string;
  onDataChange: (data: string) => void;
}

export function App({ initialData, filePath, onDataChange }: AppProps) {
  return (
    <div class="tablite-container">
      <p>Tablite: {filePath}</p>
      <p>Data length: {initialData.length} chars</p>
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

Run: `cd ~/workspace/tablite && npm run build`
Expected: `main.js` is generated without errors

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/csv-view.ts src/components/App.tsx
git commit -m "feat: obsidian plugin shell with TextFileView and Preact mount"
```

---

## Chunk 3: Table Rendering with Virtual Scrolling

### Task 4: useTableData hook — data state management

**Files:**
- Create: `src/hooks/useTableData.ts`

- [ ] **Step 1: Create useTableData.ts**

```tsx
import { useState, useCallback, useRef } from "preact/hooks";

export interface TableState {
  headers: string[];
  data: string[][];
}

interface HistoryEntry {
  headers: string[];
  data: string[][];
}

const MAX_HISTORY = 50;

export function useTableData(
  initial: TableState,
  onDataChange: (headers: string[], data: string[][]) => void,
) {
  const [headers, setHeaders] = useState(initial.headers);
  const [data, setData] = useState(initial.data);

  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      headers: headers.map((h) => h),
      data: data.map((r) => [...r]),
    });
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    futureRef.current = [];
  }, [headers, data]);

  const notify = useCallback(
    (h: string[], d: string[][]) => {
      onDataChange(h, d);
    },
    [onDataChange],
  );

  const updateCell = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      pushHistory();
      setData((prev) => {
        const next = prev.map((r) => [...r]);
        next[rowIndex][colIndex] = value;
        setHeaders((hh) => {
          notify(hh, next);
          return hh;
        });
        return next;
      });
    },
    [pushHistory, notify],
  );

  const updateHeader = useCallback(
    (colIndex: number, value: string) => {
      pushHistory();
      setHeaders((prev) => {
        const next = [...prev];
        next[colIndex] = value;
        setData((dd) => {
          notify(next, dd);
          return dd;
        });
        return next;
      });
    },
    [pushHistory, notify],
  );

  const insertRow = useCallback(
    (afterIndex: number) => {
      pushHistory();
      setData((prev) => {
        const newRow = new Array(headers.length).fill("");
        const next = [...prev];
        next.splice(afterIndex + 1, 0, newRow);
        setHeaders((hh) => {
          notify(hh, next);
          return hh;
        });
        return next;
      });
    },
    [pushHistory, headers.length, notify],
  );

  const deleteRow = useCallback(
    (index: number) => {
      pushHistory();
      setData((prev) => {
        const next = prev.filter((_, i) => i !== index);
        setHeaders((hh) => {
          notify(hh, next);
          return hh;
        });
        return next;
      });
    },
    [pushHistory, notify],
  );

  const insertColumn = useCallback(
    (afterIndex: number) => {
      pushHistory();
      setHeaders((prev) => {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, `Column ${next.length + 1}`);
        setData((dd) => {
          const nextData = dd.map((row) => {
            const r = [...row];
            r.splice(afterIndex + 1, 0, "");
            return r;
          });
          notify(next, nextData);
          return nextData;
        });
        return next;
      });
    },
    [pushHistory, notify],
  );

  const deleteColumn = useCallback(
    (index: number) => {
      pushHistory();
      setHeaders((prev) => {
        const next = prev.filter((_, i) => i !== index);
        setData((dd) => {
          const nextData = dd.map((row) => row.filter((_, i) => i !== index));
          notify(next, nextData);
          return nextData;
        });
        return next;
      });
    },
    [pushHistory, notify],
  );

  const undo = useCallback(() => {
    const entry = historyRef.current.pop();
    if (!entry) return;
    futureRef.current.push({
      headers: headers.map((h) => h),
      data: data.map((r) => [...r]),
    });
    setHeaders(entry.headers);
    setData(entry.data);
    notify(entry.headers, entry.data);
  }, [headers, data, notify]);

  const redo = useCallback(() => {
    const entry = futureRef.current.pop();
    if (!entry) return;
    historyRef.current.push({
      headers: headers.map((h) => h),
      data: data.map((r) => [...r]),
    });
    setHeaders(entry.headers);
    setData(entry.data);
    notify(entry.headers, entry.data);
  }, [headers, data, notify]);

  const reset = useCallback(
    (newState: TableState) => {
      historyRef.current = [];
      futureRef.current = [];
      setHeaders(newState.headers);
      setData(newState.data);
    },
    [],
  );

  return {
    headers,
    data,
    updateCell,
    updateHeader,
    insertRow,
    deleteRow,
    insertColumn,
    deleteColumn,
    undo,
    redo,
    reset,
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd ~/workspace/tablite && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTableData.ts
git commit -m "feat: useTableData hook with undo/redo and CRUD operations"
```

---

### Task 5: Cell and HeaderCell components

**Files:**
- Create: `src/components/Cell.tsx`
- Create: `src/components/HeaderCell.tsx`

- [ ] **Step 1: Create Cell.tsx — editable cell**

```tsx
import { useState, useRef, useCallback } from "preact/hooks";

interface CellProps {
  value: string;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  onActivate: (rowIndex: number, colIndex: number) => void;
  onUpdate: (rowIndex: number, colIndex: number, value: string) => void;
}

export function Cell({
  value,
  rowIndex,
  colIndex,
  isActive,
  onActivate,
  onUpdate,
}: CellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setEditValue(value);
    setEditing(true);
    onActivate(rowIndex, colIndex);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [value, rowIndex, colIndex, onActivate]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== value) {
      onUpdate(rowIndex, colIndex, editValue);
    }
  }, [editValue, value, rowIndex, colIndex, onUpdate]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditValue(value);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-cell-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitEdit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        }}
      />
    );
  }

  return (
    <div
      class={`tablite-cell ${isActive ? "tablite-cell-active" : ""}`}
      onDblClick={startEdit}
      onClick={() => onActivate(rowIndex, colIndex)}
    >
      {value || "\u00A0"}
    </div>
  );
}
```

- [ ] **Step 2: Create HeaderCell.tsx — sortable, resizable header**

```tsx
import { useState, useRef, useCallback } from "preact/hooks";
import type { Column, SortDirection } from "@tanstack/react-table";

interface HeaderCellProps {
  name: string;
  colIndex: number;
  column: Column<string[], unknown>;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onResize: (colIndex: number, width: number) => void;
}

export function HeaderCell({
  name,
  colIndex,
  column,
  onUpdateHeader,
  onResize,
}: HeaderCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== name) {
      onUpdateHeader(colIndex, editValue);
    }
  }, [editValue, name, colIndex, onUpdateHeader]);

  const sortDir = column.getIsSorted();
  const sortIndicator = sortDir === "asc" ? " ▲" : sortDir === "desc" ? " ▼" : "";

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = true;
      startX.current = e.clientX;
      startWidth.current = column.getSize();

      const onMouseMove = (e: MouseEvent) => {
        if (!resizing.current) return;
        const diff = e.clientX - startX.current;
        const newWidth = Math.max(50, startWidth.current + diff);
        onResize(colIndex, newWidth);
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [column, colIndex, onResize],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-header-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          if (e.key === "Escape") {
            setEditing(false);
            setEditValue(name);
          }
        }}
      />
    );
  }

  return (
    <div class="tablite-header-cell">
      <span
        class="tablite-header-name"
        onClick={() => column.toggleSorting()}
        onDblClick={() => {
          setEditValue(name);
          setEditing(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        {name}{sortIndicator}
      </span>
      <div class="tablite-resize-handle" onMouseDown={onMouseDown} />
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd ~/workspace/tablite && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/Cell.tsx src/components/HeaderCell.tsx
git commit -m "feat: editable Cell and HeaderCell components"
```

---

### Task 6: Table component with virtual scrolling

**Files:**
- Create: `src/components/Table.tsx`

- [ ] **Step 1: Create Table.tsx — TanStack Table + Virtual**

```tsx
import { useMemo, useRef, useCallback, useState } from "preact/hooks";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Cell } from "./Cell";
import { HeaderCell } from "./HeaderCell";

interface TableProps {
  headers: string[];
  data: string[][];
  onUpdateCell: (rowIndex: number, colIndex: number, value: string) => void;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onInsertRow: (afterIndex: number) => void;
  onDeleteRow: (index: number) => void;
  onInsertColumn: (afterIndex: number) => void;
  onDeleteColumn: (index: number) => void;
}

export function Table({
  headers,
  data,
  onUpdateCell,
  onUpdateHeader,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
}: TableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});

  const columns = useMemo<ColumnDef<string[], string>[]>(
    () => [
      // Row number column
      {
        id: "__row_num",
        header: "#",
        size: 50,
        minSize: 40,
        enableSorting: false,
        cell: ({ row }) => (
          <div class="tablite-row-num">{row.index + 1}</div>
        ),
      },
      ...headers.map(
        (h, i): ColumnDef<string[], string> => ({
          id: `col_${i}`,
          accessorFn: (row) => row[i] ?? "",
          size: columnSizing[`col_${i}`] ?? 150,
          minSize: 50,
          header: ({ column }) => (
            <HeaderCell
              name={h}
              colIndex={i}
              column={column}
              onUpdateHeader={onUpdateHeader}
              onResize={(colIdx, width) => {
                setColumnSizing((prev) => ({
                  ...prev,
                  [`col_${colIdx}`]: width,
                }));
              }}
            />
          ),
          cell: ({ row }) => (
            <Cell
              value={row.original[i] ?? ""}
              rowIndex={row.index}
              colIndex={i}
              isActive={
                activeCell !== null &&
                activeCell[0] === row.index &&
                activeCell[1] === i
              }
              onActivate={setActiveCell as any}
              onUpdate={onUpdateCell}
            />
          ),
        }),
      ),
    ],
    [headers, onUpdateCell, onUpdateHeader, activeCell, columnSizing],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  const onContextMenu = useCallback(
    (e: MouseEvent, rowIndex: number, colIndex: number) => {
      e.preventDefault();
      // Simple context menu using Obsidian's Menu would be ideal
      // For now use native approach
      const menu = document.createElement("div");
      menu.className = "tablite-context-menu";
      menu.innerHTML = `
        <div class="tablite-menu-item" data-action="insert-row-above">Insert Row Above</div>
        <div class="tablite-menu-item" data-action="insert-row-below">Insert Row Below</div>
        <div class="tablite-menu-item" data-action="delete-row">Delete Row</div>
        <hr/>
        <div class="tablite-menu-item" data-action="insert-col-left">Insert Column Left</div>
        <div class="tablite-menu-item" data-action="insert-col-right">Insert Column Right</div>
        <div class="tablite-menu-item" data-action="delete-col">Delete Column</div>
      `;
      menu.style.position = "fixed";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.zIndex = "1000";

      const handleClick = (ev: Event) => {
        const target = ev.target as HTMLElement;
        const action = target.dataset.action;
        switch (action) {
          case "insert-row-above": onInsertRow(rowIndex - 1); break;
          case "insert-row-below": onInsertRow(rowIndex); break;
          case "delete-row": onDeleteRow(rowIndex); break;
          case "insert-col-left": onInsertColumn(colIndex - 1); break;
          case "insert-col-right": onInsertColumn(colIndex); break;
          case "delete-col": onDeleteColumn(colIndex); break;
        }
        menu.remove();
      };

      menu.addEventListener("click", handleClick);
      document.body.appendChild(menu);

      const removeMenu = () => {
        menu.remove();
        document.removeEventListener("click", removeMenu);
      };
      requestAnimationFrame(() => {
        document.addEventListener("click", removeMenu);
      });
    },
    [onInsertRow, onDeleteRow, onInsertColumn, onDeleteColumn],
  );

  return (
    <div
      ref={tableContainerRef}
      class="tablite-table-container"
      style={{ overflow: "auto", position: "relative", height: "100%" }}
    >
      <table class="tablite-table" style={{ display: "grid" }}>
        <thead
          style={{
            display: "grid",
            position: "sticky",
            top: 0,
            zIndex: 2,
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              style={{ display: "flex", width: "100%" }}
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  class="tablite-th"
                  style={{
                    display: "flex",
                    width: header.getSize(),
                    minWidth: header.column.columnDef.minSize,
                    flexShrink: 0,
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            display: "grid",
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                style={{
                  display: "flex",
                  position: "absolute",
                  transform: `translateY(${virtualRow.start}px)`,
                  width: "100%",
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    class="tablite-td"
                    style={{
                      display: "flex",
                      width: cell.column.getSize(),
                      minWidth: cell.column.columnDef.minSize,
                      flexShrink: 0,
                    }}
                    onContextMenu={(e) =>
                      onContextMenu(
                        e as any,
                        virtualRow.index,
                        Number(cell.column.id.replace("col_", "")),
                      )
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd ~/workspace/tablite && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Table.tsx
git commit -m "feat: Table component with TanStack Table + Virtual scrolling"
```

---

## Chunk 4: Integration + Toolbar + Keyboard + Styles

### Task 7: Toolbar component

**Files:**
- Create: `src/components/Toolbar.tsx`

- [ ] **Step 1: Create Toolbar.tsx**

```tsx
import { useState, useCallback } from "preact/hooks";
import type { Delimiter } from "../parser/detect";

interface ToolbarProps {
  encoding: string;
  delimiter: string;
  rowCount: number;
  colCount: number;
  onDelimiterChange: (d: Delimiter) => void;
  onEncodingChange: (e: string) => void;
  onSearch: (query: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const DELIMITER_LABELS: Record<string, string> = {
  ",": "Comma (,)",
  ";": "Semicolon (;)",
  "\t": "Tab",
  "|": "Pipe (|)",
};

export function Toolbar({
  encoding,
  delimiter,
  rowCount,
  colCount,
  onDelimiterChange,
  onEncodingChange,
  onSearch,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(
    (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      setSearchQuery(value);
      onSearch(value);
    },
    [onSearch],
  );

  return (
    <div class="tablite-toolbar">
      <div class="tablite-toolbar-left">
        <button class="tablite-btn" onClick={onUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button
          class="tablite-btn"
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷
        </button>

        <span class="tablite-separator" />

        <select
          class="tablite-select"
          value={delimiter}
          onChange={(e) =>
            onDelimiterChange(
              (e.target as HTMLSelectElement).value as Delimiter,
            )
          }
        >
          {Object.entries(DELIMITER_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          class="tablite-select"
          value={encoding}
          onChange={(e) =>
            onEncodingChange((e.target as HTMLSelectElement).value)
          }
        >
          <option value="utf-8">UTF-8</option>
          <option value="gbk">GBK</option>
          <option value="windows-1252">Windows-1252</option>
          <option value="shift_jis">Shift-JIS</option>
        </select>

        <span class="tablite-info">
          {rowCount} rows × {colCount} cols
        </span>
      </div>

      <div class="tablite-toolbar-right">
        <input
          class="tablite-search"
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onInput={handleSearch}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Toolbar.tsx
git commit -m "feat: Toolbar with undo/redo, delimiter/encoding selectors, search"
```

---

### Task 8: Keyboard navigation hook

**Files:**
- Create: `src/hooks/useKeyboard.ts`

- [ ] **Step 1: Create useKeyboard.ts**

```tsx
import { useEffect, useCallback } from "preact/hooks";

interface UseKeyboardOptions {
  containerRef: { current: HTMLElement | null };
  rowCount: number;
  colCount: number;
  activeCell: [number, number] | null;
  onActivate: (row: number, col: number) => void;
  onStartEdit: (row: number, col: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useKeyboard({
  containerRef,
  rowCount,
  colCount,
  activeCell,
  onActivate,
  onStartEdit,
  onUndo,
  onRedo,
}: UseKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (!activeCell) return;
      const [row, col] = activeCell;

      // Skip if inside an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (row > 0) onActivate(row - 1, col);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (row < rowCount - 1) onActivate(row + 1, col);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (col > 0) onActivate(row, col - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (col < colCount - 1) onActivate(row, col + 1);
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            if (col > 0) onActivate(row, col - 1);
            else if (row > 0) onActivate(row - 1, colCount - 1);
          } else {
            if (col < colCount - 1) onActivate(row, col + 1);
            else if (row < rowCount - 1) onActivate(row + 1, 0);
          }
          break;
        case "Enter":
          e.preventDefault();
          onStartEdit(row, col);
          break;
        case "F2":
          e.preventDefault();
          onStartEdit(row, col);
          break;
      }
    },
    [activeCell, rowCount, colCount, onActivate, onStartEdit, onUndo, onRedo],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, handleKeyDown]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useKeyboard.ts
git commit -m "feat: keyboard navigation hook with arrow/tab/enter/undo support"
```

---

### Task 9: Wire everything together in App.tsx

**Files:**
- Modify: `src/components/App.tsx`

- [ ] **Step 1: Rewrite App.tsx to integrate all components**

```tsx
import { useEffect, useMemo, useCallback, useRef, useState } from "preact/hooks";
import { detect, type Delimiter } from "../parser/detect";
import { parseCSV, serializeCSV } from "../parser/csv-engine";
import { useTableData, type TableState } from "../hooks/useTableData";
import { Toolbar } from "./Toolbar";
import { Table } from "./Table";

interface AppProps {
  initialData: string;
  filePath: string;
  onDataChange: (data: string) => void;
}

export function App({ initialData, filePath, onDataChange }: AppProps) {
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [encoding, setEncoding] = useState("utf-8");
  const [searchQuery, setSearchQuery] = useState("");

  // Parse initial data
  const initialState = useMemo<TableState>(() => {
    if (!initialData || initialData.trim().length === 0) {
      return { headers: ["Column 1"], data: [[""]] };
    }

    // Detect delimiter from text
    const { detectDelimiter } = require("../parser/detect");
    const detectedDelimiter = detectDelimiter(initialData);
    setDelimiter(detectedDelimiter);

    const { headers, data } = parseCSV(initialData, detectedDelimiter);
    return { headers, data };
  }, []);

  const handleDataChange = useCallback(
    (headers: string[], data: string[][]) => {
      const csv = serializeCSV(headers, data, delimiter);
      onDataChange(csv);
    },
    [delimiter, onDataChange],
  );

  const {
    headers,
    data,
    updateCell,
    updateHeader,
    insertRow,
    deleteRow,
    insertColumn,
    deleteColumn,
    undo,
    redo,
    reset,
  } = useTableData(initialState, handleDataChange);

  // Re-parse when delimiter changes manually
  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      setDelimiter(newDelimiter);
      // Re-parse original data with new delimiter
      const { headers: h, data: d } = parseCSV(initialData, newDelimiter);
      reset({ headers: h, data: d });
    },
    [initialData, reset],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      class="tablite-container"
      tabIndex={0}
    >
      <Toolbar
        encoding={encoding}
        delimiter={delimiter}
        rowCount={data.length}
        colCount={headers.length}
        onDelimiterChange={handleDelimiterChange}
        onEncodingChange={setEncoding}
        onSearch={setSearchQuery}
        onUndo={undo}
        onRedo={redo}
      />
      <Table
        headers={headers}
        data={data}
        onUpdateCell={updateCell}
        onUpdateHeader={updateHeader}
        onInsertRow={insertRow}
        onDeleteRow={deleteRow}
        onInsertColumn={insertColumn}
        onDeleteColumn={deleteColumn}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `cd ~/workspace/tablite && npm run build`
Expected: `main.js` generated without errors

- [ ] **Step 3: Commit**

```bash
git add src/components/App.tsx
git commit -m "feat: wire up App with parser, table data, toolbar, and table"
```

---

### Task 10: Styles

**Files:**
- Create: `src/styles.css`

- [ ] **Step 1: Create styles.css**

```css
/* Tablite - Obsidian CSV Editor */

.tablite-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tablite-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* Toolbar */
.tablite-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  gap: 8px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tablite-toolbar-left,
.tablite-toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tablite-btn {
  padding: 4px 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-secondary);
  color: var(--text-normal);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.tablite-btn:hover {
  background: var(--background-modifier-hover);
}

.tablite-select {
  padding: 4px 6px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-secondary);
  color: var(--text-normal);
  font-size: 12px;
}

.tablite-separator {
  width: 1px;
  height: 20px;
  background: var(--background-modifier-border);
  margin: 0 4px;
}

.tablite-info {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 8px;
}

.tablite-search {
  padding: 4px 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
  width: 200px;
}

.tablite-search:focus {
  outline: none;
  border-color: var(--interactive-accent);
  box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
}

/* Table */
.tablite-table-container {
  flex: 1;
  overflow: auto;
  position: relative;
}

.tablite-table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
}

.tablite-th {
  background: var(--background-secondary);
  border-bottom: 2px solid var(--background-modifier-border);
  border-right: 1px solid var(--background-modifier-border);
  padding: 0;
  font-weight: 600;
  font-size: 13px;
  user-select: none;
}

.tablite-td {
  border-bottom: 1px solid var(--background-modifier-border);
  border-right: 1px solid var(--background-modifier-border);
  padding: 0;
  font-size: 13px;
}

/* Row numbers */
.tablite-row-num {
  padding: 2px 8px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  background: var(--background-secondary);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Cell */
.tablite-cell {
  padding: 2px 6px;
  min-height: 28px;
  display: flex;
  align-items: center;
  cursor: cell;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.tablite-cell:hover {
  background: var(--background-modifier-hover);
}

.tablite-cell-active {
  outline: 2px solid var(--interactive-accent);
  outline-offset: -2px;
  background: rgba(var(--interactive-accent-rgb), 0.05);
}

.tablite-cell-input {
  width: 100%;
  height: 100%;
  min-height: 28px;
  padding: 2px 6px;
  border: 2px solid var(--interactive-accent);
  border-radius: 0;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: inherit;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

/* Header */
.tablite-header-cell {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  position: relative;
  padding: 4px 6px;
}

.tablite-header-name {
  flex: 1;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tablite-header-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--interactive-accent);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: inherit;
  font-weight: 600;
  outline: none;
}

.tablite-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  user-select: none;
}

.tablite-resize-handle:hover {
  background: var(--interactive-accent);
}

/* Context Menu */
.tablite-context-menu {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 180px;
}

.tablite-context-menu hr {
  margin: 4px 0;
  border: none;
  border-top: 1px solid var(--background-modifier-border);
}

.tablite-menu-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-normal);
}

.tablite-menu-item:hover {
  background: var(--background-modifier-hover);
}
```

- [ ] **Step 2: Import styles in main.ts**

Add to the top of `src/main.ts`:

```typescript
import "./styles.css";
```

Note: esbuild will bundle the CSS. For Obsidian, the CSS must be output as `styles.css` alongside `main.js`. Update `esbuild.config.mjs` to handle this — add a second build step or use the CSS loader.

Update `esbuild.config.mjs` — add to the config object:

```javascript
  loader: { ".css": "css" },
```

And change the build to produce a separate styles.css. Replace the esbuild config content:

```javascript
import esbuild from "esbuild";
import { writeFileSync, readFileSync } from "fs";
import process from "process";

const prod = process.argv[2] === "production";

// Plugin to extract CSS to styles.css
const cssPlugin = {
  name: "css-extract",
  setup(build) {
    const cssChunks = [];
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = readFileSync(args.path, "utf8");
      cssChunks.push(css);
      return { contents: "", loader: "js" };
    });
    build.onEnd(() => {
      if (cssChunks.length > 0) {
        writeFileSync("styles.css", cssChunks.join("\n"));
        cssChunks.length = 0;
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [cssPlugin],
  alias: {
    "react": "preact/compat",
    "react-dom": "preact/compat",
    "react/jsx-runtime": "preact/jsx-runtime",
  },
  define: {
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 3: Build and verify both main.js and styles.css are generated**

Run: `cd ~/workspace/tablite && npm run build`
Expected: Both `main.js` and `styles.css` generated

- [ ] **Step 4: Commit**

```bash
git add src/styles.css esbuild.config.mjs src/main.ts
git commit -m "feat: styles and CSS extraction for Obsidian plugin"
```

---

## Chunk 5: Integration Testing in Obsidian

### Task 11: Symlink plugin into vault and test

- [ ] **Step 1: Build for production**

Run: `cd ~/workspace/tablite && npm run build production`

- [ ] **Step 2: Symlink plugin into Obsidian vault**

```bash
ln -s ~/workspace/tablite ~/.obsidian/plugins/tablite 2>/dev/null || true
# Or copy the built files:
mkdir -p ~/Documents/obsidian-vault/.obsidian/plugins/tablite
cp ~/workspace/tablite/main.js ~/Documents/obsidian-vault/.obsidian/plugins/tablite/
cp ~/workspace/tablite/styles.css ~/Documents/obsidian-vault/.obsidian/plugins/tablite/
cp ~/workspace/tablite/manifest.json ~/Documents/obsidian-vault/.obsidian/plugins/tablite/
```

- [ ] **Step 3: Enable plugin in Obsidian**

In Obsidian: Settings → Community plugins → Enable "Tablite"

- [ ] **Step 4: Test with a CSV file**

Create a test file: `~/Documents/obsidian-vault/test.csv`

```csv
Name,Age,City,Email
Alice,30,Beijing,alice@example.com
Bob,25,Shanghai,bob@example.com
Charlie,35,Guangzhou,charlie@example.com
```

Open it in Obsidian — should render as editable table.

- [ ] **Step 5: Test core features**

Manual test checklist:
- [ ] CSV file opens in table view
- [ ] Cells are editable (double-click)
- [ ] Keyboard navigation works (arrows, Tab, Enter)
- [ ] Undo/Redo works (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Column sorting works (click header)
- [ ] Column resize works (drag header edge)
- [ ] Right-click context menu works (insert/delete row/col)
- [ ] Changes are saved back to file
- [ ] Delimiter selector works
- [ ] Scrolling works with large files

- [ ] **Step 6: Fix any issues found during testing**

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: tablite v0.1.0 — CSV editor with virtual scrolling"
```
