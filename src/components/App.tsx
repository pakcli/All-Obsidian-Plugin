import { useMemo, useCallback, useRef, useState, useEffect } from "preact/hooks";
import { type Delimiter } from "../parser/detect";
import { parseCSV, serializeCSV, type ParseResult } from "../parser/csv-engine";
import { useTableData, type TableState } from "../hooks/useTableData";
import { useProgressiveLoad } from "../hooks/useProgressiveLoad";
import { Toolbar } from "./Toolbar";
import { Table } from "./Table";
import {
  normalizeColumnConfig,
  remapColumnConfigForDelete,
  remapColumnConfigForInsert,
  type ColumnConfig,
} from "../types";

interface AppProps {
  initialData: string;
  initialParsed: ParseResult;
  initialDelimiter: Delimiter;
  initialEncoding?: string;
  filePath: string;
  initialColumnConfig: ColumnConfig;
  onColumnConfigChange: (config: ColumnConfig, columnCount: number) => void | Promise<void>;
  onDataChange: (data: string) => void;
}

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

function normalizeRange(range: SelectionRange) {
  return {
    minRow: Math.min(range.startRow, range.endRow),
    maxRow: Math.max(range.startRow, range.endRow),
    minCol: Math.min(range.startCol, range.endCol),
    maxCol: Math.max(range.startCol, range.endCol),
  };
}

function copySelectionToClipboard(
  data: string[][],
  selection: SelectionRange | null,
  activeCell: ActiveCell | null,
  sortedRowIndices: number[] | null,
) {
  let selectedRows: number[];
  let minCol: number, maxCol: number;

  if (selection) {
    const norm = normalizeRange(selection);
    minCol = norm.minCol;
    maxCol = norm.maxCol;
    // Collect rows in display order that fall within the selection range
    const rowSet = new Set<number>();
    const minRow = norm.minRow;
    const maxRow = norm.maxRow;
    // Selection uses original data indices; collect all original indices in the range
    if (sortedRowIndices) {
      // Walk in display order, pick rows whose original index is in range
      for (const origIdx of sortedRowIndices) {
        if (origIdx >= minRow && origIdx <= maxRow) rowSet.add(origIdx);
      }
      selectedRows = sortedRowIndices.filter((idx) => rowSet.has(idx));
    } else {
      selectedRows = [];
      for (let r = minRow; r <= maxRow; r++) selectedRows.push(r);
    }
  } else if (activeCell) {
    selectedRows = [activeCell.row];
    minCol = maxCol = activeCell.col;
  } else {
    return;
  }

  const lines: string[] = [];
  for (const r of selectedRows) {
    const cells: string[] = [];
    for (let c = minCol!; c <= maxCol!; c++) {
      cells.push(data[r]?.[c] ?? "");
    }
    lines.push(cells.join("\t"));
  }
  void navigator.clipboard.writeText(lines.join("\n"));
}

function ensureEditableState(state: TableState): TableState {
  const headerCount = Math.max(1, state.headers.length);
  const headers =
    state.headers.length > 0
      ? state.headers
      : Array.from({ length: headerCount }, (_, index) => `Column ${index + 1}`);

  const data =
    state.data.length > 0
      ? state.data.map((row) => {
          if (row.length < headers.length) {
            return [...row, ...new Array(headers.length - row.length).fill("")];
          }
          return row.slice(0, headers.length);
        })
      : [new Array(headers.length).fill("")];

  return { headers, data };
}

export function App({
  initialData,
  initialParsed,
  initialDelimiter,
  initialEncoding,
  filePath,
  initialColumnConfig,
  onColumnConfigChange,
  onDataChange,
}: AppProps) {
  // Use pre-parsed result from csv-view — no redundant re-parsing
  const [delimiter, setDelimiter] = useState<Delimiter>(initialDelimiter);
  const [encoding, setEncoding] = useState(initialEncoding ?? "utf-8");
  const [searchQuery, setSearchQuery] = useState("");
  const [crossHighlight, setCrossHighlight] = useState(true);
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean>(initialParsed.hasHeader);
  const sortedRowIndicesRef = useRef<number[] | null>(null);

  const initialState = useMemo<TableState>(
    () => ensureEditableState({ headers: initialParsed.headers, data: initialParsed.data }),
    [],
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
  } = useTableData(initialState, useCallback(
    (nextHeaders: string[], nextData: string[][]) => {
      const csv = serializeCSV(nextHeaders, nextData, delimiter, hasHeader);
      onDataChange(csv);
    },
    [delimiter, hasHeader, onDataChange],
  ));

  // Progressive loading: feed rows to Table in chunks
  const { visibleCount, loading, progress } = useProgressiveLoad(data.length);
  const visibleData = useMemo(
    () => (visibleCount >= data.length ? data : data.slice(0, visibleCount)),
    [data, visibleCount],
  );

  const [columnConfig, setColumnConfig] = useState<ColumnConfig>(() =>
    normalizeColumnConfig(initialColumnConfig, initialState.headers.length),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setColumnConfig((prev) => normalizeColumnConfig(prev, headers.length));
  }, [headers.length]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void onColumnConfigChange(columnConfig, headers.length);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [columnConfig, headers.length, onColumnConfigChange]);

  const visibleColumns = useMemo(
    () => columnConfig.order.filter((index) => !columnConfig.hidden.includes(index)),
    [columnConfig.hidden, columnConfig.order],
  );

  // Search always uses full data, not just the progressively-loaded portion
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [] as ActiveCell[];

    const matches: ActiveCell[] = [];
    for (let rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      for (const colIndex of visibleColumns) {
        const value = data[rowIndex]?.[colIndex] ?? "";
        if (value.toLowerCase().includes(query)) {
          matches.push({ row: rowIndex, col: colIndex });
        }
      }
    }
    return matches;
  }, [data, searchQuery, visibleColumns]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const currentIndex = searchMatches.findIndex(
      (match) => match.row === activeCell?.row && match.col === activeCell?.col,
    );
    if (currentIndex >= 0) return;
    setActiveCell(searchMatches[0]);
  }, [activeCell?.col, activeCell?.row, searchMatches]);

  const handleDelimiterChange = useCallback(
    (newDelimiter: Delimiter) => {
      setDelimiter(newDelimiter);
      const { headers: nextHeaders, data: nextData } = parseCSV(initialData, newDelimiter, hasHeader);
      reset(ensureEditableState({ headers: nextHeaders, data: nextData }));
      setColumnConfig((prev) => normalizeColumnConfig(prev, nextHeaders.length));
    },
    [hasHeader, initialData, reset],
  );

  const handleHasHeaderChange = useCallback(
    (nextHasHeader: boolean) => {
      setHasHeader(nextHasHeader);
      const { headers: nextHeaders, data: nextData } = parseCSV(initialData, delimiter, nextHasHeader);
      reset(ensureEditableState({ headers: nextHeaders, data: nextData }));
      setColumnConfig((prev) => normalizeColumnConfig(prev, nextHeaders.length));
    },
    [delimiter, initialData, reset],
  );

  const handleInsertColumn = useCallback(
    (afterIndex: number) => {
      const insertIndex = afterIndex + 1;
      setColumnConfig((prev) => remapColumnConfigForInsert(prev, insertIndex, headers.length + 1));
      setActiveCell((prev) => {
        if (!prev || prev.col < insertIndex) return prev;
        return { ...prev, col: prev.col + 1 };
      });
      insertColumn(afterIndex);
    },
    [headers.length, insertColumn],
  );

  const handleDeleteColumn = useCallback(
    (index: number) => {
      setColumnConfig((prev) => remapColumnConfigForDelete(prev, index, Math.max(1, headers.length - 1)));
      setActiveCell((prev) => {
        if (!prev) return prev;
        if (prev.col === index) return null;
        if (prev.col < index) return prev;
        return { ...prev, col: prev.col - 1 };
      });
      deleteColumn(index);
    },
    [deleteColumn, headers.length],
  );

  const handleDeleteRow = useCallback(
    (index: number) => {
      setActiveCell((prev) => {
        if (!prev) return prev;
        if (data.length <= 1) return { row: 0, col: prev.col };
        if (prev.row === index) {
          return { row: Math.max(0, Math.min(index, data.length - 2)), col: prev.col };
        }
        if (prev.row > index) {
          return { row: prev.row - 1, col: prev.col };
        }
        return prev;
      });
      deleteRow(index);
    },
    [data.length, deleteRow],
  );

  const toggleColumnVisibility = useCallback((colIndex: number) => {
    setColumnConfig((prev) => {
      const isHidden = prev.hidden.includes(colIndex);
      const hidden = isHidden
        ? prev.hidden.filter((index) => index !== colIndex)
        : [...prev.hidden, colIndex];
      return normalizeColumnConfig({ ...prev, hidden }, headers.length);
    });
  }, [headers.length]);

  const showAllColumns = useCallback(() => {
    setColumnConfig((prev) => normalizeColumnConfig({ ...prev, hidden: [] }, headers.length));
  }, [headers.length]);

  const moveColumn = useCallback((sourceIndex: number, targetIndex: number) => {
    setColumnConfig((prev) => {
      if (sourceIndex === targetIndex) return prev;
      const nextOrder = [...prev.order];
      const from = nextOrder.indexOf(sourceIndex);
      const to = nextOrder.indexOf(targetIndex);
      if (from < 0 || to < 0) return prev;
      nextOrder.splice(from, 1);
      nextOrder.splice(to, 0, sourceIndex);
      return normalizeColumnConfig({ ...prev, order: nextOrder }, headers.length);
    });
  }, [headers.length]);

  const updateColumnSizing = useCallback((sizing: Record<string, number>) => {
    setColumnConfig((prev) => normalizeColumnConfig({ ...prev, sizing }, headers.length));
  }, [headers.length]);

  const updateFrozenCount = useCallback((frozenCount: number) => {
    setColumnConfig((prev) => normalizeColumnConfig({ ...prev, frozenCount }, headers.length));
  }, [headers.length]);

  const navigateSearch = useCallback((direction: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const currentIndex = searchMatches.findIndex(
      (match) => match.row === activeCell?.row && match.col === activeCell?.col,
    );
    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : searchMatches.length - 1
        : (currentIndex + direction + searchMatches.length) % searchMatches.length;
    setActiveCell(searchMatches[nextIndex]);
  }, [activeCell?.col, activeCell?.row, searchMatches]);

  // Navigate rows in display order (respects sorting/filtering)
  const getAdjacentRow = useCallback(
    (currentRow: number, delta: number): number => {
      const indices = sortedRowIndicesRef.current;
      if (!indices || indices.length === 0) {
        return Math.max(0, Math.min(data.length - 1, currentRow + delta));
      }
      const pos = indices.indexOf(currentRow);
      if (pos < 0) return currentRow;
      const nextPos = Math.max(0, Math.min(indices.length - 1, pos + delta));
      return indices[nextPos];
    },
    [data.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        copySelectionToClipboard(data, selection, activeCell, sortedRowIndicesRef.current);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "F3") {
        event.preventDefault();
        navigateSearch(event.shiftKey ? -1 : 1);
        return;
      }

      const isInsideTablite = !!target?.closest(".tablite-container");
      if (isTextInput || !isInsideTablite) return;

      if (!activeCell) return;

      if (event.shiftKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const base = selection
          ? { row: selection.endRow, col: selection.endCol }
          : { row: activeCell.row, col: activeCell.col };
        let nextRow = base.row;
        let nextCol = base.col;
        switch (event.key) {
          case "ArrowUp": nextRow = getAdjacentRow(base.row, -1); break;
          case "ArrowDown": nextRow = getAdjacentRow(base.row, 1); break;
          case "ArrowLeft": nextCol = Math.max(0, base.col - 1); break;
          case "ArrowRight": nextCol = Math.min(headers.length - 1, base.col + 1); break;
        }
        setSelection({
          startRow: selection?.startRow ?? activeCell.row,
          startCol: selection?.startCol ?? activeCell.col,
          endRow: nextRow,
          endCol: nextCol,
        });
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          setSelection(null);
          setActiveCell({ row: getAdjacentRow(activeCell.row, -1), col: activeCell.col });
          break;
        case "ArrowDown":
          event.preventDefault();
          setSelection(null);
          setActiveCell({ row: getAdjacentRow(activeCell.row, 1), col: activeCell.col });
          break;
        case "ArrowLeft":
          event.preventDefault();
          setSelection(null);
          if (activeCell.col > 0) setActiveCell({ row: activeCell.row, col: activeCell.col - 1 });
          break;
        case "ArrowRight":
          event.preventDefault();
          setSelection(null);
          if (activeCell.col < headers.length - 1) setActiveCell({ row: activeCell.row, col: activeCell.col + 1 });
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [activeCell, data, selection, headers.length, navigateSearch, getAdjacentRow]);

  const activeMatchIndex = useMemo(
    () => searchMatches.findIndex((match) => match.row === activeCell?.row && match.col === activeCell?.col),
    [activeCell?.col, activeCell?.row, searchMatches],
  );

  return (
    <div
      ref={containerRef}
      class="tablite-container"
      data-file-path={filePath}
      tabIndex={0}
    >
      <Toolbar
        encoding={encoding}
        delimiter={delimiter}
        hasHeader={hasHeader}
        crossHighlight={crossHighlight}
        rowCount={data.length}
        colCount={headers.length}
        headers={headers}
        columnOrder={columnConfig.order}
        hiddenColumns={columnConfig.hidden}
        frozenCount={columnConfig.frozenCount}
        searchQuery={searchQuery}
        searchMatchIndex={activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0}
        searchMatchCount={searchMatches.length}
        searchInputRef={searchInputRef}
        loading={loading}
        loadProgress={progress}
        onDelimiterChange={handleDelimiterChange}
        onEncodingChange={setEncoding}
        onHasHeaderChange={handleHasHeaderChange}
        onCrossHighlightChange={setCrossHighlight}
        onSearch={setSearchQuery}
        onSearchNext={() => navigateSearch(1)}
        onSearchPrev={() => navigateSearch(-1)}
        onToggleColumnVisibility={toggleColumnVisibility}
        onShowAllColumns={showAllColumns}
        onFrozenCountChange={updateFrozenCount}
        onUndo={undo}
        onRedo={redo}
      />
      <Table
        headers={headers}
        data={visibleData}
        searchQuery={searchQuery}
        crossHighlight={crossHighlight}
        activeCell={activeCell}
        selection={selection}
        columnOrder={columnConfig.order}
        hiddenColumns={columnConfig.hidden}
        columnSizing={columnConfig.sizing}
        frozenCount={columnConfig.frozenCount}
        onActiveCellChange={setActiveCell}
        onSelectionChange={setSelection}
        onCopy={() => copySelectionToClipboard(data, selection, activeCell, sortedRowIndicesRef.current)}
        onColumnOrderChange={moveColumn}
        onColumnSizingChange={updateColumnSizing}
        onUpdateCell={updateCell}
        onUpdateHeader={updateHeader}
        onInsertRow={insertRow}
        onDeleteRow={handleDeleteRow}
        onInsertColumn={handleInsertColumn}
        onDeleteColumn={handleDeleteColumn}
        sortedRowIndicesRef={sortedRowIndicesRef}
      />
    </div>
  );
}
