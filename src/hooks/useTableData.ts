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
        const filtered = prev.filter((_, i) => i !== index);
        const next = filtered.length > 0
          ? filtered
          : [new Array(Math.max(1, headers.length)).fill("")];
        setHeaders((hh) => {
          notify(hh, next);
          return hh;
        });
        return next;
      });
    },
    [pushHistory, headers.length, notify],
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
        const filteredHeaders = prev.filter((_, i) => i !== index);
        const nextHeaders = filteredHeaders.length > 0 ? filteredHeaders : ["Column 1"];
        setData((dd) => {
          const filteredData = dd.map((row) => row.filter((_, i) => i !== index));
          const nextData = filteredHeaders.length > 0
            ? filteredData
            : filteredData.map(() => [""]);
          notify(nextHeaders, nextData);
          return nextData;
        });
        return nextHeaders;
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
