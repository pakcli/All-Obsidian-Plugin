import { useMemo, useRef, useCallback, useState, useEffect } from "preact/hooks";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type FilterFn,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Cell } from "./Cell";
import { HeaderCell } from "./HeaderCell";

interface ActiveCell {
  row: number;
  col: number;
}

interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface TableProps {
  headers: string[];
  data: string[][];
  searchQuery: string;
  crossHighlight: boolean;
  activeCell: ActiveCell | null;
  selection: SelectionRange | null;
  columnOrder: number[];
  hiddenColumns: number[];
  columnSizing: Record<string, number>;
  frozenCount: number;
  sortedRowIndicesRef?: { current: number[] | null };
  onActiveCellChange: (cell: ActiveCell | null) => void;
  onSelectionChange: (selection: SelectionRange | null) => void;
  onCopy: () => void;
  onColumnOrderChange: (sourceIndex: number, targetIndex: number) => void;
  onColumnSizingChange: (sizing: Record<string, number>) => void;
  onUpdateCell: (rowIndex: number, colIndex: number, value: string) => void;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onInsertRow: (afterIndex: number) => void;
  onDeleteRow: (index: number) => void;
  onInsertColumn: (afterIndex: number) => void;
  onDeleteColumn: (index: number) => void;
}

interface RangeFilterValue {
  min?: string;
  max?: string;
}

/** Max rows to sample for column type / filter variant inference */
const TYPE_SAMPLE_SIZE = 100;

/** Infer column type by sampling first N rows directly — avoids extracting the full column array */
function inferColumnType(data: string[][], colIndex: number): "number" | "date" | "string" {
  const sampleSize = Math.min(data.length, TYPE_SAMPLE_SIZE);
  const nonEmpty: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const v = (data[i]?.[colIndex] ?? "").trim();
    if (v) nonEmpty.push(v);
  }
  if (nonEmpty.length === 0) return "string";

  const numberCount = nonEmpty.filter((value) => {
    if (Number.isNaN(Number(value))) return false;
    // Exclude long pure-digit strings (e.g. phone numbers, IDs) — cap at 10 digits
    const stripped = value.replace(/[-+.,\s]/g, "");
    if (/^\d+$/.test(stripped) && stripped.length > 10) return false;
    return true;
  }).length;
  if (numberCount / nonEmpty.length >= 0.9) return "number";

  const dateCount = nonEmpty.filter((value) => !Number.isNaN(Date.parse(value))).length;
  if (dateCount / nonEmpty.length >= 0.9) return "date";

  return "string";
}

/** Determine filter UI variant by sampling first N rows directly */
function getFilterVariant(data: string[][], colIndex: number, dataType: "number" | "date" | "string"): "text" | "select" | "numberRange" | "dateRange" {
  if (dataType === "number") return "numberRange";
  if (dataType === "date") return "dateRange";

  const sampleSize = Math.min(data.length, TYPE_SAMPLE_SIZE);
  const normalized: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const v = (data[i]?.[colIndex] ?? "").trim();
    if (v.length > 0) normalized.push(v);
  }

  if (normalized.length === 0) return "text";

  const uniqueCount = new Set(normalized).size;
  if (uniqueCount >= 2 && uniqueCount <= 10) {
    return "select";
  }

  return "text";
}

const textFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase();
  if (!query) return true;
  const value = String(row.getValue(columnId) ?? "").toLowerCase();
  return value.includes(query);
};

const selectFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const selected = filterValue as string[] | undefined;
  if (!selected || selected.length === 0) return true;
  const value = String(row.getValue(columnId) ?? "").trim();
  return selected.includes(value);
};

const numberRangeFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const range = (filterValue as RangeFilterValue | undefined) ?? {};
  if (!range.min && !range.max) return true;

  const raw = String(row.getValue(columnId) ?? "").trim();
  if (!raw) return false;

  const value = Number(raw);
  if (Number.isNaN(value)) return false;

  const min = range.min != null && range.min !== "" ? Number(range.min) : undefined;
  const max = range.max != null && range.max !== "" ? Number(range.max) : undefined;

  if (min != null && Number.isNaN(min)) return true;
  if (max != null && Number.isNaN(max)) return true;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
};

const dateRangeFilter: FilterFn<string[]> = (row, columnId, filterValue) => {
  const range = (filterValue as RangeFilterValue | undefined) ?? {};
  if (!range.min && !range.max) return true;

  const raw = String(row.getValue(columnId) ?? "").trim();
  if (!raw) return false;

  const value = Date.parse(raw);
  if (Number.isNaN(value)) return false;

  const min = range.min ? Date.parse(range.min) : undefined;
  const max = range.max ? Date.parse(range.max) : undefined;

  if (min != null && Number.isNaN(min)) return true;
  if (max != null && Number.isNaN(max)) return true;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
};

export function Table({
  headers,
  data,
  searchQuery,
  crossHighlight,
  activeCell,
  selection,
  columnOrder,
  hiddenColumns,
  columnSizing,
  frozenCount,
  onActiveCellChange,
  onSelectionChange,
  onCopy,
  onColumnOrderChange,
  onColumnSizingChange,
  onUpdateCell,
  onUpdateHeader,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
  sortedRowIndicesRef,
}: TableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const onUpdateCellRef = useRef(onUpdateCell);
  onUpdateCellRef.current = onUpdateCell;

  const onUpdateHeaderRef = useRef(onUpdateHeader);
  onUpdateHeaderRef.current = onUpdateHeader;

  const visibleColumnOrder = useMemo(
    () => columnOrder.filter((index) => !hiddenColumns.includes(index)),
    [columnOrder, hiddenColumns],
  );

  const columnTypes = useMemo(
    () => Object.fromEntries(headers.map((_, index) => [index, inferColumnType(data, index)])),
    [data, headers],
  );

  const columnFilterVariants = useMemo(
    () =>
      Object.fromEntries(
        headers.map((_, index) => [index, getFilterVariant(data, index, columnTypes[index])]),
      ),
    [columnTypes, data, headers],
  );

  const columns = useMemo<ColumnDef<string[], string>[]>(
    () => [
      {
        id: "__row_num",
        header: () => <div class="tablite-row-num">#</div>,
        size: 50,
        minSize: 40,
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => <div class="tablite-row-num">{row.index + 1}</div>,
      },
      ...visibleColumnOrder.map(
        (sourceIndex): ColumnDef<string[], string> => ({
          id: `col_${sourceIndex}`,
          accessorFn: (row) => row[sourceIndex] ?? "",
          size: columnSizing[String(sourceIndex)] ?? 150,
          minSize: 50,
          filterFn:
            columnFilterVariants[sourceIndex] === "select"
              ? selectFilter
              : columnFilterVariants[sourceIndex] === "numberRange"
                ? numberRangeFilter
                : columnFilterVariants[sourceIndex] === "dateRange"
                  ? dateRangeFilter
                  : textFilter,
          sortingFn: (rowA, rowB, columnId) => {
            const a = String(rowA.getValue(columnId) ?? "");
            const b = String(rowB.getValue(columnId) ?? "");
            const type = columnTypes[sourceIndex];
            if (type === "number") return Number(a) - Number(b);
            if (type === "date") return Date.parse(a) - Date.parse(b);
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
          },
          meta: {
            sourceIndex,
            dataType: columnTypes[sourceIndex],
            filterVariant: columnFilterVariants[sourceIndex],
          },
          header: ({ column }) => (
            <HeaderCell
              name={headers[sourceIndex]}
              colIndex={sourceIndex}
              column={column}
              onUpdateHeader={(colIndex, value) => onUpdateHeaderRef.current(colIndex, value)}
              onResize={(colIndex, width) => {
                onColumnSizingChange({
                  ...columnSizing,
                  [String(colIndex)]: width,
                });
              }}
              onMoveColumn={onColumnOrderChange}
            />
          ),
          cell: ({ row }) => (
            <Cell
              value={row.original[sourceIndex] ?? ""}
              rowIndex={row.index}
              colIndex={sourceIndex}
              searchQueryRef={searchQueryRef}
              onUpdate={(rowIndex, colIndex, value) => onUpdateCellRef.current(rowIndex, colIndex, value)}
            />
          ),
        }),
      ),
    ],
    [
      visibleColumnOrder,
      columnSizing,
      headers,
      columnFilterVariants,
      columnTypes,
      onColumnOrderChange,
      onColumnSizingChange,
    ],
  );

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    forceUpdate((value) => value + 1);
  }, [searchQuery]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  // Build original-index → display-position map for activeCell/selection lookups
  const originalToDisplay = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < rows.length; i++) {
      map.set(rows[i].index, i);
    }
    return map;
  }, [rows]);

  // Expose sorted row indices (original data index in display order) to parent
  if (sortedRowIndicesRef) {
    sortedRowIndicesRef.current = rows.map((r) => r.index);
  }

  const totalWidth = table.getHeaderGroups()[0]?.headers.reduce(
    (sum, header) => sum + header.getSize(),
    0,
  ) ?? 0;

  const frozenOffsets = useMemo(() => {
    let offset = 0;
    const offsets: Record<string, number> = {};
    const headerGroup = table.getHeaderGroups()[0];
    for (const header of headerGroup?.headers ?? []) {
      offsets[header.column.id] = offset;
      offset += header.getSize();
    }
    return offsets;
  }, [table, totalWidth]);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<ActiveCell | null>(null);

  const isCellSelected = useCallback(
    (row: number, col: number) => {
      if (!selection) return false;
      const minRow = Math.min(selection.startRow, selection.endRow);
      const maxRow = Math.max(selection.startRow, selection.endRow);
      const minCol = Math.min(selection.startCol, selection.endCol);
      const maxCol = Math.max(selection.startCol, selection.endCol);
      return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
    },
    [selection],
  );

  const handleCellMouseDown = useCallback(
    (event: MouseEvent, rowIndex: number, colIndex: number) => {
      if (colIndex < 0) return; // row number column
      if (event.button !== 0) return; // left click only

      if (event.shiftKey && activeCell) {
        // Shift+click: extend selection from activeCell
        onSelectionChange({
          startRow: activeCell.row,
          startCol: activeCell.col,
          endRow: rowIndex,
          endCol: colIndex,
        });
        event.preventDefault();
        return;
      }

      // Start drag
      isDraggingRef.current = true;
      dragStartRef.current = { row: rowIndex, col: colIndex };
      onActiveCellChange({ row: rowIndex, col: colIndex });
      onSelectionChange(null);
    },
    [activeCell, onActiveCellChange, onSelectionChange],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const container = tableContainerRef.current;
      if (!container) return;

      // Find cell under cursor
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const td = target?.closest<HTMLElement>("[data-row-index][data-col-index]");
      if (!td) return;

      const rowIndex = Number(td.dataset.rowIndex);
      const colIndex = Number(td.dataset.colIndex);
      if (Number.isNaN(rowIndex) || Number.isNaN(colIndex) || colIndex < 0) return;

      const start = dragStartRef.current;
      if (rowIndex !== start.row || colIndex !== start.col) {
        onSelectionChange({
          startRow: start.row,
          startCol: start.col,
          endRow: rowIndex,
          endCol: colIndex,
        });
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onSelectionChange]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  useEffect(() => {
    if (!activeCell) return;
    // activeCell.row is an original data index; convert to display position for virtualizer
    const displayIndex = originalToDisplay.get(activeCell.row);
    if (displayIndex == null) return;
    rowVirtualizer.scrollToIndex(displayIndex, { align: "auto" });

    const frame = window.requestAnimationFrame(() => {
      const container = tableContainerRef.current;
      if (!container) return;

      const cell = container.querySelector<HTMLElement>(
        `[data-row-index="${activeCell.row}"][data-col-index="${activeCell.col}"]`,
      );
      cell?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeCell, rowVirtualizer, originalToDisplay]);

  const onContextMenu = useCallback(
    (event: MouseEvent, rowIndex: number, colIndex: number) => {
      event.preventDefault();
      const menu = document.createElement("div");
      menu.className = "tablite-context-menu";
      const menuItems: Array<{ action: string; label: string } | "hr"> = [
        { action: "copy", label: "Copy" },
        "hr",
        { action: "insert-row-above", label: "Insert Row Above" },
        { action: "insert-row-below", label: "Insert Row Below" },
        { action: "delete-row", label: "Delete Row" },
        "hr",
        { action: "insert-col-left", label: "Insert Column Left" },
        { action: "insert-col-right", label: "Insert Column Right" },
        { action: "delete-col", label: "Delete Column" },
      ];
      for (const item of menuItems) {
        if (item === "hr") {
          menu.appendChild(document.createElement("hr"));
        } else {
          const div = document.createElement("div");
          div.className = "tablite-menu-item";
          div.dataset.action = item.action;
          div.textContent = item.label;
          menu.appendChild(div);
        }
      }
      menu.style.setProperty("--tablite-menu-left", `${event.clientX}px`);
      menu.style.setProperty("--tablite-menu-top", `${event.clientY}px`);

      const handleClick = (ev: Event) => {
        const target = ev.target as HTMLElement;
        switch (target.dataset.action) {
          case "copy":
            onCopy();
            break;
          case "insert-row-above":
            onInsertRow(rowIndex - 1);
            break;
          case "insert-row-below":
            onInsertRow(rowIndex);
            break;
          case "delete-row":
            onDeleteRow(rowIndex);
            break;
          case "insert-col-left":
            onInsertColumn(colIndex - 1);
            break;
          case "insert-col-right":
            onInsertColumn(colIndex);
            break;
          case "delete-col":
            onDeleteColumn(colIndex);
            break;
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
    [onCopy, onDeleteColumn, onDeleteRow, onInsertColumn, onInsertRow],
  );

  const getPinnedStyles = useCallback(
    (cellId: string, position: number, isHeader: boolean) => {
      const isPinned = position < frozenCount || cellId === "__row_num";
      if (!isPinned) return {};
      return {
        position: "sticky",
        left: `${frozenOffsets[cellId] ?? 0}px`,
        zIndex: isHeader ? 5 : 3,
      } as const;
    },
    [frozenCount, frozenOffsets],
  );

  return (
    <div ref={tableContainerRef} class="tablite-table-container">
      <table class="tablite-table" style={{ display: "grid" }}>
        <thead
          style={{
            display: "grid",
            position: "sticky",
            top: 0,
            zIndex: 4,
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} style={{ display: "flex", width: `${totalWidth}px`, minWidth: "100%" }}>
              {headerGroup.headers.map((header, position) => {
                const isRowNum = header.column.id === "__row_num";
                const colIdx = isRowNum ? -1 : Number(header.column.id.replace("col_", ""));
                const isColHL = crossHighlight && activeCell != null && colIdx === activeCell.col;
                return (
                  <th
                    key={header.id}
                    class={`tablite-th${isColHL ? " tablite-col-highlight" : ""}${position < frozenCount + 1 ? " tablite-frozen-cell" : ""}`}
                    style={{
                      display: "flex",
                      width: header.getSize(),
                      minWidth: header.column.columnDef.minSize,
                      flexShrink: 0,
                      ...getPinnedStyles(header.column.id, position, true),
                    }}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
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
                data-row-index={row.index}
                ref={(element) => {
                  if (element) rowVirtualizer.measureElement(element);
                }}
                style={{
                  display: "flex",
                  position: "absolute",
                  transform: `translateY(${virtualRow.start}px)`,
                  width: `${totalWidth}px`,
                  minWidth: "100%",
                }}
              >
                {row.getVisibleCells().map((cell, position) => {
                  const isRowNum = cell.column.id === "__row_num";
                  const colIdx = isRowNum ? -1 : Number(cell.column.id.replace("col_", ""));
                  const isActive = !isRowNum && activeCell?.row === row.index && activeCell?.col === colIdx;
                  const isSelected = !isRowNum && !isActive && isCellSelected(row.index, colIdx);
                  const isRowHL = crossHighlight && !isRowNum && activeCell != null && activeCell.row === row.index;
                  const isColHL = crossHighlight && !isRowNum && activeCell != null && activeCell.col === colIdx;

                  let className = "tablite-td";
                  if (isActive && !selection) className += " tablite-td-active";
                  else if (isActive || isSelected) className += " tablite-td-selected";
                  else if (isRowHL || isColHL) className += " tablite-td-cross";
                  if (position < frozenCount + 1) className += " tablite-frozen-cell";

                  return (
                    <td
                      key={cell.id}
                      data-row-index={row.index}
                      data-col-index={colIdx >= 0 ? colIdx : undefined}
                      class={className}
                      style={{
                        display: "flex",
                        width: cell.column.getSize(),
                        minWidth: cell.column.columnDef.minSize,
                        flexShrink: 0,
                        userSelect: "none",
                        ...getPinnedStyles(cell.column.id, position, false),
                      }}
                      onMouseDown={(event) => handleCellMouseDown(event as unknown as MouseEvent, row.index, colIdx)}
                      onContextMenu={(event) => onContextMenu(event as unknown as MouseEvent, row.index, colIdx)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
