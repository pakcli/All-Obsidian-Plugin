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
import { parseAutocompleteSettings, resolveHeaderName } from "../utils/views";
import { ConfirmReorderModal } from "../utils/confirmModal";
import { serializeCSV } from "../parser/csv-engine";
import { downloadAllYtThumbnails } from "../utils/youtubeThumbnail";
import { Notice } from "obsidian";

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
  onMoveRow?: (sourceIndex: number, targetIndex: number) => void;
  onMoveRows?: (sourceIndices: number[], targetIndex: number) => void;
  onDeleteRows?: (indices: number[]) => void;
  onInsertColumn: (afterIndex: number) => void;
  onDeleteColumn: (index: number) => void;
  autocompleteColumns?: string;
  filePath?: string;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  onSortingChange: (updater: any) => void;
  onColumnFiltersChange: (updater: any) => void;
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

  // If items look like URLs, paths, or long sentences, default to text search filter
  const hasLongOrUrl = normalized.some((v) => v.length > 25 || v.startsWith("http://") || v.startsWith("https://"));
  if (hasLongOrUrl) return "text";

  const uniqueCount = new Set(normalized).size;
  if (uniqueCount >= 2 && uniqueCount <= 8) {
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
  onMoveRow,
  onMoveRows,
  onDeleteRows,
  onInsertColumn,
  onDeleteColumn,
  sortedRowIndicesRef,
  autocompleteColumns,
  filePath,
  sorting,
  columnFilters,
  onSortingChange,
  onColumnFiltersChange,
}: TableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const lastSelectedRowRef = useRef<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  const autocompleteCols = useMemo(() => {
    const setting = autocompleteColumns || "";
    const { columns } = parseAutocompleteSettings(setting);
    return columns;
  }, [autocompleteColumns]);

  const uniqueValues = useMemo(() => {
    const colValuesMap: Record<number, string[]> = {};
    headers.forEach((_, colIndex) => {
      colValuesMap[colIndex] = Array.from(
        new Set(data.map((row) => row[colIndex]).filter((v) => v !== undefined && v !== null && v !== "")),
      );
    });
    return colValuesMap;
  }, [data, headers]);

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const onUpdateCellRef = useRef(onUpdateCell);
  onUpdateCellRef.current = onUpdateCell;

  const onUpdateHeaderRef = useRef(onUpdateHeader);
  onUpdateHeaderRef.current = onUpdateHeader;

  const visibleColumnOrder = useMemo(() => {
    const orderSet = new Set(columnOrder);
    const completeOrder = [
      ...columnOrder.filter((idx) => idx < headers.length),
      ...headers.map((_, idx) => idx).filter((idx) => !orderSet.has(idx)),
    ];
    return completeOrder.filter((index) => !hiddenColumns.includes(index));
  }, [columnOrder, headers, hiddenColumns]);

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
        id: "__select",
        enableSorting: false,
        enableColumnFilter: false,
        size: 34,
        minSize: 34,
        header: () => (
          <div class="tablite-row-select-header" title="Select / Deselect All">
            <input
              type="checkbox"
              class="tablite-row-checkbox"
              checked={selectedRows.size === data.length && data.length > 0}
              indeterminate={selectedRows.size > 0 && selectedRows.size < data.length}
              onChange={(e) => {
                const checked = (e.target as HTMLInputElement).checked;
                if (checked) {
                  setSelectedRows(new Set(data.map((_, i) => i)));
                } else {
                  setSelectedRows(new Set());
                }
              }}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div class="tablite-row-select-cell" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              class="tablite-row-checkbox"
              checked={selectedRows.has(row.index)}
              onClick={(e) => {
                e.stopPropagation();
                const mouseEvent = e as unknown as MouseEvent;
                const isShift = mouseEvent.shiftKey;
                const targetIndex = row.index;

                setSelectedRows((prev) => {
                  const next = new Set(prev);
                  if (isShift && lastSelectedRowRef.current !== null) {
                    const start = Math.min(lastSelectedRowRef.current, targetIndex);
                    const end = Math.max(lastSelectedRowRef.current, targetIndex);
                    for (let i = start; i <= end; i++) {
                      next.add(i);
                    }
                  } else {
                    if (next.has(targetIndex)) {
                      next.delete(targetIndex);
                    } else {
                      next.add(targetIndex);
                    }
                  }
                  return next;
                });
                lastSelectedRowRef.current = targetIndex;
              }}
            />
          </div>
        ),
      },
      {
        id: "__row_num",
        accessorFn: (_, index) => index,
        enableSorting: true,
        enableColumnFilter: false,
        sortingFn: (rowA, rowB) => rowA.index - rowB.index,
        header: ({ column }) => {
          const sortDir = column.getIsSorted();
          const sortIndicator = sortDir === "asc" ? " ▲" : sortDir === "desc" ? " ▼" : "";
          return (
            <div
              class="tablite-row-num tablite-row-num-header"
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Click to sort by Row ID (#) | Drag row to reorder"
              onClick={() => {
                column.toggleSorting(undefined, true);
              }}
            >
              #{sortIndicator}
            </div>
          );
        },
        size: 50,
        minSize: 45,
        cell: ({ row }) => {
          const isSelected = selectedRows.has(row.index);
          return (
            <div
              class="tablite-row-num tablite-row-num-drag"
              draggable
              title="Drag to reorder row (or Shift+Click to multiselect)"
              onClick={(e) => {
                const mouseEvent = e as unknown as MouseEvent;
                if (mouseEvent.shiftKey && lastSelectedRowRef.current !== null) {
                  const start = Math.min(lastSelectedRowRef.current, row.index);
                  const end = Math.max(lastSelectedRowRef.current, row.index);
                  setSelectedRows((prev) => {
                    const next = new Set(prev);
                    for (let i = start; i <= end; i++) {
                      next.add(i);
                    }
                    return next;
                  });
                }
              }}
              onDragStart={(e) => {
                const indicesToDrag =
                  isSelected && selectedRows.size > 1
                    ? Array.from(selectedRows).sort((a, b) => a - b)
                    : [row.index];
                e.dataTransfer?.setData("text/tablite-rows", JSON.stringify(indicesToDrag));
                e.dataTransfer?.setData("text/tablite-row", String(row.index));
                e.dataTransfer?.setData("text/plain", `[Row ${row.index + 1}]`);
                e.dataTransfer!.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer!.dropEffect = "move";
                setDragOverRow(row.index);
              }}
              onDragLeave={() => {
                setDragOverRow(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverRow(null);
                let sourceIndices: number[] = [];
                const rowsJson = e.dataTransfer?.getData("text/tablite-rows");
                if (rowsJson) {
                  try {
                    sourceIndices = JSON.parse(rowsJson);
                  } catch {}
                }
                if (sourceIndices.length === 0) {
                  const single = Number(e.dataTransfer?.getData("text/tablite-row"));
                  if (!Number.isNaN(single)) sourceIndices = [single];
                }

                if (sourceIndices.length > 0) {
                  if (sourceIndices.length === 1 && sourceIndices[0] === row.index) return;
                  const count = sourceIndices.length;
                  const targetPos = row.index + 1;
                  const msg =
                    count === 1
                      ? `Are you sure you want to move Row #${sourceIndices[0] + 1} to position #${targetPos}?`
                      : `Are you sure you want to move ${count} selected rows to position #${targetPos}?`;

                  const globalApp = (window as any).app;
                  const executeMove = () => {
                    if (onMoveRows) {
                      onMoveRows(sourceIndices, row.index);
                    } else if (onMoveRow && sourceIndices.length === 1) {
                      onMoveRow(sourceIndices[0], row.index);
                    }
                  };

                  if (globalApp) {
                    new ConfirmReorderModal(
                      globalApp,
                      count === 1 ? "Move Row" : "Move Selected Rows",
                      msg,
                      executeMove,
                    ).open();
                  } else {
                    executeMove();
                  }
                }
              }}
            >
              <span class="tablite-drag-dots">⋮⋮</span>
              <span>{row.index + 1}</span>
            </div>
          );
        },
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
            const a = String(rowA.getValue(columnId) ?? "").trim();
            const b = String(rowB.getValue(columnId) ?? "").trim();
            const type = columnTypes[sourceIndex];
            let diff = 0;
            if (type === "number") {
              const numA = Number(a);
              const numB = Number(b);
              if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
                diff = numA - numB;
              } else {
                diff = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
              }
            } else if (type === "date") {
              const dateA = Date.parse(a);
              const dateB = Date.parse(b);
              if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) {
                diff = dateA - dateB;
              } else {
                diff = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
              }
            } else {
              diff = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
            }

            // Stable priority: Fall back to original row index (Column 1 / # priority)
            if (diff === 0) {
              return rowA.index - rowB.index;
            }
            return diff;
          },
          meta: {
            sourceIndex,
            dataType: columnTypes[sourceIndex],
            filterVariant: columnFilterVariants[sourceIndex],
          },
          header: ({ column }) => (
            <HeaderCell
              name={headers[sourceIndex]}
              displayName={resolveHeaderName(headers[sourceIndex], autocompleteColumns || "")}
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
          cell: ({ row }) => {
            const isAutocomplete = autocompleteCols.includes(headers[sourceIndex].toLowerCase());
            return (
              <Cell
                value={row.original[sourceIndex] ?? ""}
                rowIndex={row.index}
                colIndex={sourceIndex}
                searchQueryRef={searchQueryRef}
                onUpdate={(rowIndex, colIndex, value) => onUpdateCellRef.current(rowIndex, colIndex, value)}
                isAutocomplete={isAutocomplete}
                values={uniqueValues[sourceIndex]}
                filePath={filePath}
                columnName={headers[sourceIndex]}
              />
            );
          },
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
      autocompleteCols,
      uniqueValues,
      data,
      selectedRows,
      onMoveRow,
      onMoveRows,
      onActiveCellChange,
      onSelectionChange,
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
    onSortingChange: onSortingChange,
    onColumnFiltersChange: onColumnFiltersChange,
    enableMultiSort: true,
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
      if (event.button !== 0) return; // left click only

      if (colIndex < 0) {
        // Row selection mode (clicked on row number column)
        isDraggingRef.current = true;
        dragStartRef.current = { row: rowIndex, col: -1 };
        onActiveCellChange({ row: rowIndex, col: 0 });
        onSelectionChange({
          startRow: rowIndex,
          startCol: 0,
          endRow: rowIndex,
          endCol: headers.length - 1,
        });
        event.preventDefault();
        return;
      }

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
    [activeCell, headers.length, onActiveCellChange, onSelectionChange],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const container = tableContainerRef.current;
      if (!container) return;

      // Find cell under cursor
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const td = target?.closest<HTMLElement>("[data-row-index]");
      if (!td) return;

      const rowIndex = Number(td.dataset.rowIndex);
      const colIndexAttr = td.getAttribute("data-col-index");
      const colIndex = colIndexAttr !== null && colIndexAttr !== "" ? Number(colIndexAttr) : -1;
      
      if (Number.isNaN(rowIndex)) return;

      const start = dragStartRef.current;
      if (start.col === -1) {
        // Row drag selection mode
        onSelectionChange({
          startRow: start.row,
          startCol: 0,
          endRow: rowIndex,
          endCol: headers.length - 1,
        });
      } else {
        // Normal cell drag selection mode
        const targetCol = colIndex >= 0 ? colIndex : 0;
        if (rowIndex !== start.row || targetCol !== start.col) {
          onSelectionChange({
            startRow: start.row,
            startCol: start.col,
            endRow: rowIndex,
            endCol: targetCol,
          });
        }
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
  }, [onSelectionChange, headers.length]);

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
      menu.setCssProps({ "--tablite-menu-left": `${event.clientX}px`, "--tablite-menu-top": `${event.clientY}px` });

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
      window.requestAnimationFrame(() => {
        document.addEventListener("click", removeMenu);
      });
    },
    [onCopy, onDeleteColumn, onDeleteRow, onInsertColumn, onInsertRow],
  );

  const getPinnedStyles = useCallback(
    (cellId: string, position: number, isHeader: boolean) => {
      const isPinned = position < frozenCount || cellId === "__select" || cellId === "__row_num";
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
                const isSpecialCol = header.column.id === "__select" || header.column.id === "__row_num";
                const colIdx = isSpecialCol ? -1 : Number(header.column.id.replace("col_", ""));
                const isColHL = crossHighlight && activeCell != null && colIdx === activeCell.col;
                const isColSelected = !isSpecialCol && (selection
                  ? (colIdx >= Math.min(selection.startCol, selection.endCol) && colIdx <= Math.max(selection.startCol, selection.endCol))
                  : (activeCell?.col === colIdx));

                let thClass = "tablite-th";
                if (header.column.id === "__select") thClass += " tablite-th-select";
                if (header.column.id === "__row_num") thClass += " tablite-th-row-num";
                if (isColHL) thClass += " tablite-col-highlight";
                if (position < frozenCount + 2) thClass += " tablite-frozen-cell";
                if (isColSelected) thClass += " tablite-col-selected";

                return (
                  <th
                    key={header.id}
                    class={thClass}
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
            const isChecked = selectedRows.has(row.index);
            const isDragTarget = dragOverRow === row.index;
            let trClass = "tablite-tr";
            if (isChecked) trClass += " tablite-tr-checked";
            if (isDragTarget) trClass += " tablite-tr-drag-over";

            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                data-row-index={row.index}
                class={trClass}
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
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverRow(row.index);
                }}
                onDragLeave={() => {
                  setDragOverRow((current) => (current === row.index ? null : current));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverRow(null);
                  let sourceIndices: number[] = [];
                  const rowsJson = e.dataTransfer?.getData("text/tablite-rows");
                  if (rowsJson) {
                    try {
                      sourceIndices = JSON.parse(rowsJson);
                    } catch {}
                  }
                  if (sourceIndices.length === 0) {
                    const single = Number(e.dataTransfer?.getData("text/tablite-row"));
                    if (!Number.isNaN(single)) sourceIndices = [single];
                  }

                  if (sourceIndices.length > 0) {
                    if (sourceIndices.length === 1 && sourceIndices[0] === row.index) return;
                    const count = sourceIndices.length;
                    const targetPos = row.index + 1;
                    const msg =
                      count === 1
                        ? `Are you sure you want to move Row #${sourceIndices[0] + 1} to position #${targetPos}?`
                        : `Are you sure you want to move ${count} selected rows to position #${targetPos}?`;

                    const globalApp = (window as any).app;
                    const executeMove = () => {
                      if (onMoveRows) {
                        onMoveRows(sourceIndices, row.index);
                      } else if (onMoveRow && sourceIndices.length === 1) {
                        onMoveRow(sourceIndices[0], row.index);
                      }
                    };

                    if (globalApp) {
                      new ConfirmReorderModal(
                        globalApp,
                        count === 1 ? "Move Row" : "Move Selected Rows",
                        msg,
                        executeMove,
                      ).open();
                    } else {
                      executeMove();
                    }
                  }
                }}
              >
                {row.getVisibleCells().map((cell, position) => {
                   const isSelect = cell.column.id === "__select";
                   const isRowNum = cell.column.id === "__row_num";
                   const colIdx = isSelect || isRowNum ? -1 : Number(cell.column.id.replace("col_", ""));
                   const isActive = !isSelect && !isRowNum && activeCell?.row === row.index && activeCell?.col === colIdx;
                   const isSelected = !isSelect && !isRowNum && !isActive && isCellSelected(row.index, colIdx);
                   const isRowHL = crossHighlight && !isSelect && !isRowNum && activeCell != null && activeCell.row === row.index;
                   const isColHL = crossHighlight && !isSelect && !isRowNum && activeCell != null && activeCell.col === colIdx;
 
                   const isRowSelected = selection
                     ? (row.index >= Math.min(selection.startRow, selection.endRow) && row.index <= Math.max(selection.startRow, selection.endRow))
                     : (activeCell?.row === row.index);
 
                   let className = "tablite-td";
                   if (isSelect) {
                     className += " tablite-td-select";
                   } else if (isRowNum) {
                     if (isRowSelected) className += " tablite-row-num-selected";
                   } else {
                     if (isActive && !selection) className += " tablite-td-active";
                     else if (isActive || isSelected) className += " tablite-td-selected";
                     else if (isRowHL || isColHL) className += " tablite-td-cross";
                   }
                   if (position < frozenCount + 2) className += " tablite-frozen-cell";

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
                      onMouseDown={(event) => {
                        if (!isSelect && !isRowNum) {
                          handleCellMouseDown(event as unknown as MouseEvent, row.index, colIdx);
                        }
                      }}
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
      {selectedRows.size > 0 && (
        <div class="tablite-floating-actions">
          <div class="tablite-fa-info">
            <span class="tablite-fa-badge">{selectedRows.size}</span>
            <span>row{selectedRows.size === 1 ? "" : "s"} selected</span>
          </div>
          <button
            type="button"
            class="tablite-fa-btn"
            title="Copy selected rows as CSV to clipboard"
            onClick={() => {
              const selectedIndices = Array.from(selectedRows).sort((a, b) => a - b);
              const selectedData = selectedIndices.map((i) => data[i]);
              const csv = serializeCSV(headers, selectedData, ",", false);
              navigator.clipboard.writeText(csv);
              new Notice(`✓ Copied ${selectedIndices.length} rows to clipboard!`);
            }}
          >
            📋 Copy CSV
          </button>
          <button
            type="button"
            class="tablite-fa-btn"
            title="Cache YouTube thumbnails for selected rows"
            onClick={() => {
              const selectedIndices = Array.from(selectedRows);
              const selectedData = selectedIndices.map((i) => data[i]);
              const globalApp = (window as any).app;
              if (globalApp) {
                downloadAllYtThumbnails(globalApp, selectedData);
              }
            }}
          >
            🎬 Cache YT
          </button>
          <button
            type="button"
            class="tablite-fa-btn tablite-fa-danger"
            title="Delete selected rows"
            onClick={() => {
              const globalApp = (window as any).app;
              const count = selectedRows.size;
              const doDelete = () => {
                if (onDeleteRows) onDeleteRows(Array.from(selectedRows));
                setSelectedRows(new Set());
                new Notice(`Deleted ${count} rows.`);
              };

              if (globalApp) {
                new ConfirmReorderModal(
                  globalApp,
                  "Delete Selected Rows",
                  `Are you sure you want to delete ${count} selected row${count === 1 ? "" : "s"}? You can undo this with Ctrl+Z.`,
                  doDelete,
                ).open();
              } else {
                doDelete();
              }
            }}
          >
            🗑️ Delete ({selectedRows.size})
          </button>
          <button
            type="button"
            class="tablite-fa-close"
            title="Clear selection"
            onClick={() => setSelectedRows(new Set())}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
