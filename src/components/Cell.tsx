import { useState, useRef, useEffect } from "preact/hooks";
import type { RefObject } from "preact";

interface CellProps {
  value: string;
  rowIndex: number;
  colIndex: number;
  searchQueryRef: RefObject<string>;
  onUpdate: (rowIndex: number, colIndex: number, value: string) => void;
}

export function Cell({
  value,
  rowIndex,
  colIndex,
  searchQueryRef,
  onUpdate,
}: CellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync value from parent when not editing
  useEffect(() => {
    if (!editing) setEditValue(value);
  }, [value, editing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-cell-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={() => {
          setEditing(false);
          if (editValue !== value) {
            onUpdate(rowIndex, colIndex, editValue);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditValue(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  const sq = searchQueryRef.current ?? "";
  const isMatch = sq.length > 0 && value.toLowerCase().includes(sq.toLowerCase());

  return (
    <div
      class={`tablite-cell ${isMatch ? "tablite-cell-match" : ""}`}
      onDblClick={() => {
        setEditValue(value);
        setEditing(true);
      }}
    >
      {value || "\u00A0"}
    </div>
  );
}
