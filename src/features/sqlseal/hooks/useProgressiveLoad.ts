import { useState, useEffect, useRef } from "preact/hooks";

/** Rows loaded per idle frame */
const CHUNK_SIZE = 2000;
/** Initial rows to render immediately (keeps first paint fast) */
const INITIAL_ROWS = 500;

export interface ProgressiveLoadState {
  /** Number of rows currently available for rendering */
  visibleCount: number;
  /** Whether loading is still in progress */
  loading: boolean;
  /** 0-1 progress */
  progress: number;
}

/**
 * Progressively reveals rows to the rendering layer.
 *
 * All data is already parsed and in memory (held by useTableData).
 * This hook controls how many rows are passed to TanStack Table,
 * preventing the initial render from processing all rows at once.
 *
 * Virtual scrolling handles the DOM — this handles the data model.
 */
export function useProgressiveLoad(totalRows: number): ProgressiveLoadState {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_ROWS, totalRows),
  );
  const totalRef = useRef(totalRows);

  // Reset on major changes (e.g. delimiter switch re-parses).
  // Single row insert/delete should NOT restart progressive loading.
  useEffect(() => {
    if (totalRows !== totalRef.current) {
      const prev = totalRef.current;
      totalRef.current = totalRows;
      if (Math.abs(totalRows - prev) > 1) {
        setVisibleCount(Math.min(INITIAL_ROWS, totalRows));
      } else {
        setVisibleCount((v) => Math.min(v, totalRows));
      }
    }
  }, [totalRows]);

  // Progressively load more rows during idle time
  useEffect(() => {
    if (visibleCount >= totalRows) return;

    // Use requestIdleCallback where available, fall back to setTimeout
    const schedule =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 16) as unknown as number;
    const cancel =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : (id: number) => clearTimeout(id);

    const id = schedule(() => {
      setVisibleCount((prev) => Math.min(prev + CHUNK_SIZE, totalRows));
    });

    return () => cancel(id);
  }, [visibleCount, totalRows]);

  const loading = visibleCount < totalRows;
  const progress = totalRows === 0 ? 1 : visibleCount / totalRows;

  return { visibleCount, loading, progress };
}
