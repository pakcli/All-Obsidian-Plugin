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
