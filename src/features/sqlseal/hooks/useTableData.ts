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
      const nextData = data.map((r) => [...r]);
      nextData[rowIndex][colIndex] = value;
      setData(nextData);
      notify(headers, nextData);
    },
    [pushHistory, data, headers, notify],
  );

  const updateHeader = useCallback(
    (colIndex: number, value: string) => {
      pushHistory();
      const nextHeaders = [...headers];
      nextHeaders[colIndex] = value;
      setHeaders(nextHeaders);
      notify(nextHeaders, data);
    },
    [pushHistory, headers, data, notify],
  );

  const insertRow = useCallback(
    (afterIndex: number) => {
      pushHistory();
      const nextData = [...data];
      const newRow = new Array(headers.length).fill("");
      nextData.splice(afterIndex + 1, 0, newRow);
      setData(nextData);
      notify(headers, nextData);
    },
    [pushHistory, data, headers, notify],
  );

  const deleteRow = useCallback(
    (index: number) => {
      pushHistory();
      const filtered = data.filter((_, i) => i !== index);
      const nextData = filtered.length > 0
        ? filtered
        : [new Array(Math.max(1, headers.length)).fill("")];
      setData(nextData);
      notify(headers, nextData);
    },
    [pushHistory, data, headers, notify],
  );

  const insertColumn = useCallback(
    (afterIndex: number) => {
      pushHistory();
      const nextHeaders = [...headers];
      nextHeaders.splice(afterIndex + 1, 0, `Column ${nextHeaders.length + 1}`);
      const nextData = data.map((row) => {
        const r = [...row];
        r.splice(afterIndex + 1, 0, "");
        return r;
      });
      setHeaders(nextHeaders);
      setData(nextData);
      notify(nextHeaders, nextData);
    },
    [pushHistory, headers, data, notify],
  );

  const deleteColumn = useCallback(
    (index: number) => {
      pushHistory();
      const filteredHeaders = headers.filter((_, i) => i !== index);
      const nextHeaders = filteredHeaders.length > 0 ? filteredHeaders : ["Column 1"];
      const filteredData = data.map((row) => row.filter((_, i) => i !== index));
      const nextData = filteredHeaders.length > 0
        ? filteredData
        : filteredData.map(() => [""]);
      setHeaders(nextHeaders);
      setData(nextData);
      notify(nextHeaders, nextData);
    },
    [pushHistory, headers, data, notify],
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

  const replaceSingle = useCallback(
    (
      rowIndex: number,
      colIndex: number,
      search: string,
      replacement: string,
      options: { matchCase?: boolean; matchWholeWord?: boolean } = {},
    ): boolean => {
      const currentVal = data[rowIndex]?.[colIndex];
      if (typeof currentVal !== "string" || !search) return false;
      const flags = options.matchCase ? "" : "i";
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regexStr = options.matchWholeWord ? `\\b${escaped}\\b` : escaped;
      let pattern: RegExp;
      try {
        pattern = new RegExp(regexStr, flags);
      } catch {
        return false;
      }

      if (pattern.test(currentVal)) {
        pushHistory();
        const nextData = data.map((r) => [...r]);
        nextData[rowIndex][colIndex] = currentVal.replace(pattern, replacement);
        setData(nextData);
        notify(headers, nextData);
        return true;
      }
      return false;
    },
    [pushHistory, data, headers, notify],
  );

  const replaceAll = useCallback(
    (
      search: string,
      replacement: string,
      options: { matchCase?: boolean; matchWholeWord?: boolean; targetCol?: number | null } = {},
    ): number => {
      if (!search) return 0;
      let count = 0;
      const flags = options.matchCase ? "g" : "gi";
      let pattern: RegExp;
      try {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regexStr = options.matchWholeWord ? `\\b${escaped}\\b` : escaped;
        pattern = new RegExp(regexStr, flags);
      } catch {
        return 0;
      }

      const nextData = data.map((row) =>
        row.map((cell, colIndex) => {
          if (options.targetCol !== null && options.targetCol !== undefined && options.targetCol >= 0 && options.targetCol !== colIndex) {
            return cell;
          }
          if (typeof cell !== "string") return cell;
          if (pattern.test(cell)) {
            const matches = cell.match(pattern);
            if (matches) count += matches.length;
            return cell.replace(pattern, replacement);
          }
          return cell;
        }),
      );

      if (count > 0) {
        pushHistory();
        setData(nextData);
        notify(headers, nextData);
      }
      return count;
    },
    [pushHistory, data, headers, notify],
  );

  const moveRow = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      if (
        sourceIndex === targetIndex ||
        sourceIndex < 0 ||
        targetIndex < 0 ||
        sourceIndex >= data.length ||
        targetIndex >= data.length
      )
        return;
      pushHistory();
      const nextData = [...data];
      const [movedRow] = nextData.splice(sourceIndex, 1);
      nextData.splice(targetIndex, 0, movedRow);
      setData(nextData);
      notify(headers, nextData);
    },
    [pushHistory, data, headers, notify],
  );

  const moveRows = useCallback(
    (sourceIndices: number[], targetIndex: number) => {
      if (sourceIndices.length === 0 || targetIndex < 0 || targetIndex >= data.length) return;
      const selectedSet = new Set(sourceIndices);
      const sortedSelected = Array.from(selectedSet).sort((a, b) => a - b);
      const movedRows = sortedSelected.map((i) => data[i]);

      const targetRow = data[targetIndex];
      const remainingRows = data.filter((_, i) => !selectedSet.has(i));

      let insertPos = remainingRows.indexOf(targetRow);
      if (insertPos === -1) {
        insertPos = Math.min(targetIndex, remainingRows.length);
      }

      pushHistory();
      const nextData = [...remainingRows];
      nextData.splice(insertPos, 0, ...movedRows);
      setData(nextData);
      notify(headers, nextData);
    },
    [pushHistory, data, headers, notify],
  );

  const deleteRows = useCallback(
    (indices: number[]) => {
      if (indices.length === 0) return;
      pushHistory();
      const indexSet = new Set(indices);
      const nextData = data.filter((_, i) => !indexSet.has(i));
      const finalData = nextData.length > 0 ? nextData : [new Array(Math.max(1, headers.length)).fill("")];
      setData(finalData);
      notify(headers, finalData);
    },
    [pushHistory, data, headers, notify],
  );

  return {
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
  };
}
