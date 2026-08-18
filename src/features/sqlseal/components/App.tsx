import { useMemo, useCallback, useRef, useState, useEffect } from "preact/hooks";
import { type Delimiter } from "../parser/detect";
import { parseCSV, serializeCSV, type ParseResult } from "../parser/csv-engine";
import { useTableData, type TableState } from "../hooks/useTableData";
import { useProgressiveLoad } from "../hooks/useProgressiveLoad";
import { Toolbar } from "./Toolbar";
import { Table } from "./Table";
import { RawEditor } from "./RawEditor";
import { FindReplaceBar } from "./FindReplaceBar";
import {
  normalizeColumnConfig,
  remapColumnConfigForDelete,
  remapColumnConfigForInsert,
  type ColumnConfig,
} from "../types";
import { getArtifactPath, ensureFolderExists } from "../utils/views";
import { downloadAllYtThumbnails } from "../utils/youtubeThumbnail";
import { Notice } from "obsidian";

interface AppProps {
  initialData: string;
  initialParsed: ParseResult;
  initialDelimiter: Delimiter;
  initialEncoding?: string;
  filePath: string;
  initialColumnConfig: ColumnConfig;
  onColumnConfigChange: (config: ColumnConfig, columnCount: number) => void | Promise<void>;
  onDataChange: (data: string) => void;
  autocompleteColumns?: string;
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
  autocompleteColumns,
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
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [views, setViews] = useState<Record<string, ColumnConfig>>({});
  const [activeView, setActiveView] = useState<string>("Default");
  const [isViewsLoaded, setIsViewsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "raw">("table");
  const [rawText, setRawText] = useState<string>(() => initialData);

  const handleRawTextChange = useCallback(
    (newText: string) => {
      setRawText(newText);
      onDataChange(newText);
    },
    [onDataChange],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        setCtrlPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        setCtrlPressed(false);
      }
    };
    const handleBlur = () => {
      setCtrlPressed(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const initialState = useMemo<TableState>(
    () => ensureEditableState({ headers: initialParsed.headers, data: initialParsed.data }),
    [],
  );

  const [isFindOpen, setIsFindOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [searchTargetCol, setSearchTargetCol] = useState<number | null>(null);

  const {
    headers,
    data,
    updateCell,
    updateHeader,
    insertRow,
    deleteRow,
    deleteRows,
    moveRow,
    moveRows,
    insertColumn,
    deleteColumn,
    undo,
    redo,
    reset,
    replaceSingle,
    replaceAll,
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

  const saveViewsArtifact = useCallback(async (updatedViews: Record<string, ColumnConfig>, currentActive: string) => {
    const globalApp = (window as any).app;
    if (!globalApp || !filePath) return;
    const artifactPath = getArtifactPath(filePath);
    
    const parentIndex = artifactPath.lastIndexOf('/');
    if (parentIndex !== -1) {
      const parentPath = artifactPath.substring(0, parentIndex);
      await ensureFolderExists(globalApp, parentPath);
    }

    const payload = {
      activeView: currentActive,
      views: updatedViews
    };
    const content = JSON.stringify(payload, null, 2);
    
    const file = globalApp.vault.getFileByPath(artifactPath);
    if (file) {
      await globalApp.vault.modify(file, content);
    } else {
      await globalApp.vault.create(artifactPath, content);
    }
  }, [filePath]);

  useEffect(() => {
    const loadViews = async () => {
      const globalApp = (window as any).app;
      if (!globalApp || !filePath) {
        setIsViewsLoaded(true);
        return;
      }
      const artifactPath = getArtifactPath(filePath);
      const file = globalApp.vault.getFileByPath(artifactPath);
      if (file) {
        try {
          const content = await globalApp.vault.read(file);
          const parsed = JSON.parse(content);
          if (parsed && parsed.views && parsed.activeView) {
            setViews(parsed.views);
            setActiveView(parsed.activeView);
            if (parsed.views[parsed.activeView]) {
              setColumnConfig(normalizeColumnConfig(parsed.views[parsed.activeView], headers.length));
            }
            setIsViewsLoaded(true);
            return;
          }
        } catch (e) {
          console.error("Failed to load view artifact", e);
        }
      }
      
      const defaultViews = {
        "Default": normalizeColumnConfig(initialColumnConfig, headers.length)
      };
      setViews(defaultViews);
      setActiveView("Default");
      setIsViewsLoaded(true);
    };
    loadViews();
  }, [filePath]);

  useEffect(() => {
    if (!isViewsLoaded || !activeView) return;
    
    const stored = views[activeView];
    if (stored) {
      if (
        JSON.stringify(stored.order) === JSON.stringify(columnConfig.order) &&
        JSON.stringify(stored.hidden) === JSON.stringify(columnConfig.hidden) &&
        JSON.stringify(stored.sizing) === JSON.stringify(columnConfig.sizing) &&
        stored.frozenCount === columnConfig.frozenCount &&
        JSON.stringify(stored.filters || []) === JSON.stringify(columnConfig.filters || []) &&
        JSON.stringify(stored.sorting || []) === JSON.stringify(columnConfig.sorting || [])
      ) {
        return;
      }
    }

    const nextViews = {
      ...views,
      [activeView]: columnConfig
    };
    setViews(nextViews);
    saveViewsArtifact(nextViews, activeView);
  }, [columnConfig, activeView, views, isViewsLoaded, saveViewsArtifact]);

  const handleViewChange = useCallback((viewName: string) => {
    if (views[viewName]) {
      setActiveView(viewName);
      setColumnConfig(normalizeColumnConfig(views[viewName], headers.length));
      saveViewsArtifact(views, viewName);
    }
  }, [views, headers.length, saveViewsArtifact]);

  const handleAddView = useCallback((viewName: string) => {
    const cleanName = viewName.trim();
    if (!cleanName) return;
    const nextViews = {
      ...views,
      [cleanName]: normalizeColumnConfig({
        order: Array.from({ length: headers.length }, (_, i) => i),
        hidden: [],
        sizing: {},
        frozenCount: 0
      }, headers.length)
    };
    setViews(nextViews);
    setActiveView(cleanName);
    setColumnConfig(nextViews[cleanName]);
    saveViewsArtifact(nextViews, cleanName);
  }, [views, headers.length, saveViewsArtifact]);

  const handleDuplicateView = useCallback((viewName: string) => {
    const cleanName = viewName.trim();
    if (!cleanName) return;
    const nextViews = {
      ...views,
      [cleanName]: { ...columnConfig }
    };
    setViews(nextViews);
    setActiveView(cleanName);
    saveViewsArtifact(nextViews, cleanName);
  }, [views, columnConfig, saveViewsArtifact]);

  const handleDeleteView = useCallback(() => {
    const viewKeys = Object.keys(views);
    if (viewKeys.length <= 1) {
      new Notice("Cannot delete the only view.");
      return;
    }
    const nextViews = { ...views };
    delete nextViews[activeView];
    const nextActive = Object.keys(nextViews)[0];
    setViews(nextViews);
    setActiveView(nextActive);
    setColumnConfig(normalizeColumnConfig(nextViews[nextActive], headers.length));
    saveViewsArtifact(nextViews, nextActive);
  }, [views, activeView, headers.length, saveViewsArtifact]);

  const handleColumnFiltersChange = useCallback((updaterOrValue: any) => {
    setColumnConfig((prev) => {
      const nextFilters = typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.filters || [])
        : updaterOrValue;
      return {
        ...prev,
        filters: nextFilters
      };
    });
  }, []);

  const handleSortingChange = useCallback((updaterOrValue: any) => {
    setColumnConfig((prev) => {
      const nextSorting = typeof updaterOrValue === 'function'
        ? updaterOrValue(prev.sorting || [])
        : updaterOrValue;
      return {
        ...prev,
        sorting: nextSorting
      };
    });
  }, []);



  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);


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
    const query = searchQuery.trim();
    if (!query) return [] as ActiveCell[];

    const flags = matchCase ? "g" : "gi";
    let pattern: RegExp;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regexStr = matchWholeWord ? `\\b${escaped}\\b` : escaped;
      pattern = new RegExp(regexStr, flags);
    } catch {
      return [] as ActiveCell[];
    }

    const matches: ActiveCell[] = [];
    const colsToSearch =
      searchTargetCol !== null && searchTargetCol >= 0
        ? [searchTargetCol]
        : visibleColumns;

    for (let rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      for (const colIndex of colsToSearch) {
        const value = data[rowIndex]?.[colIndex] ?? "";
        if (pattern.test(value)) {
          matches.push({ row: rowIndex, col: colIndex });
        }
      }
    }
    return matches;
  }, [data, searchQuery, visibleColumns, matchCase, matchWholeWord, searchTargetCol]);

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

  const handleReplaceCurrent = useCallback(() => {
    if (!activeCell || !searchQuery) return;
    const isReplaced = replaceSingle(
      activeCell.row,
      activeCell.col,
      searchQuery,
      replaceQuery,
      { matchCase, matchWholeWord },
    );
    if (isReplaced) {
      navigateSearch(1);
    }
  }, [activeCell, searchQuery, replaceQuery, matchCase, matchWholeWord, replaceSingle, navigateSearch]);

  const handleReplaceAll = useCallback(() => {
    if (!searchQuery) return;
    const count = replaceAll(
      searchQuery,
      replaceQuery,
      { matchCase, matchWholeWord, targetCol: searchTargetCol },
    );
    new Notice(`✓ Replaced ${count} occurrence${count === 1 ? "" : "s"}.`);
  }, [searchQuery, replaceQuery, matchCase, matchWholeWord, searchTargetCol, replaceAll]);

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
        setIsFindOpen(true);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setIsFindOpen(true);
        setShowReplace(true);
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

  const handleToggleViewMode = useCallback(() => {
    if (viewMode === "table") {
      const currentCsv = serializeCSV(headers, data, delimiter, hasHeader);
      setRawText(currentCsv);
      setViewMode("raw");
    } else {
      try {
        const parsed = parseCSV(rawText, delimiter, hasHeader);
        const validatedState = ensureEditableState({ headers: parsed.headers, data: parsed.data });
        reset(validatedState);
      } catch (err) {
        console.error("Tablite: error parsing raw CSV", err);
      }
      setViewMode("table");
    }
  }, [viewMode, headers, data, delimiter, hasHeader, rawText, reset]);

  const handleDownloadThumbnails = useCallback(() => {
    const globalApp = (window as any).app;
    if (globalApp) {
      downloadAllYtThumbnails(globalApp, data);
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      class={`tablite-container ${ctrlPressed ? "sqlseal-ctrl-pressed" : ""}`}
      data-file-path={filePath}
      tabIndex={0}
    >
      <Toolbar
        encoding={encoding}
        delimiter={delimiter}
        hasHeader={hasHeader}
        crossHighlight={crossHighlight}
        rowCount={viewMode === "raw" ? rawText.split("\n").length : data.length}
        colCount={viewMode === "raw" ? 1 : headers.length}
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
        views={views}
        activeView={activeView}
        onViewChange={handleViewChange}
        onAddView={handleAddView}
        onDuplicateView={handleDuplicateView}
        onDeleteView={handleDeleteView}
        autocompleteColumns={autocompleteColumns}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
        onDownloadThumbnails={handleDownloadThumbnails}
        isFindOpen={isFindOpen}
        onToggleFindReplace={() => setIsFindOpen(!isFindOpen)}
      />
      <FindReplaceBar
        isOpen={isFindOpen}
        showReplace={showReplace}
        searchQuery={searchQuery}
        replaceQuery={replaceQuery}
        matchCase={matchCase}
        matchWholeWord={matchWholeWord}
        selectedColumn={searchTargetCol}
        headers={headers}
        matchIndex={activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0}
        matchCount={searchMatches.length}
        onSearchChange={setSearchQuery}
        onReplaceChange={setReplaceQuery}
        onToggleMatchCase={() => setMatchCase(!matchCase)}
        onToggleMatchWholeWord={() => setMatchWholeWord(!matchWholeWord)}
        onColumnChange={setSearchTargetCol}
        onToggleReplaceRow={() => setShowReplace(!showReplace)}
        onNextMatch={() => navigateSearch(1)}
        onPrevMatch={() => navigateSearch(-1)}
        onReplaceCurrent={handleReplaceCurrent}
        onReplaceAll={handleReplaceAll}
        onClose={() => setIsFindOpen(false)}
      />
      {viewMode === "raw" ? (
        <RawEditor
          value={rawText}
          onChange={handleRawTextChange}
          onSwitchToTable={handleToggleViewMode}
          delimiter={delimiter}
          encoding={encoding}
          filePath={filePath}
        />
      ) : (
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
          onMoveRow={moveRow}
          onMoveRows={moveRows}
          onDeleteRows={deleteRows}
          onInsertColumn={handleInsertColumn}
          onDeleteColumn={handleDeleteColumn}
          sortedRowIndicesRef={sortedRowIndicesRef}
          autocompleteColumns={autocompleteColumns}
          filePath={filePath}
          sorting={columnConfig.sorting || []}
          columnFilters={columnConfig.filters || []}
          onSortingChange={handleSortingChange}
          onColumnFiltersChange={handleColumnFiltersChange}
        />
      )}
    </div>
  );
}
