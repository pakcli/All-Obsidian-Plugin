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
