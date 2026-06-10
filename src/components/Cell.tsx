import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import type { RefObject } from "preact";
import { Fragment } from "preact";
import { resolveWikiLink } from "../utils/wiki";

interface CellProps {
  value: string;
  rowIndex: number;
  colIndex: number;
  searchQueryRef: RefObject<string>;
  onUpdate: (rowIndex: number, colIndex: number, value: string) => void;
  isAutocomplete?: boolean;
  values?: string[];
  filePath?: string;
  columnName?: string;
}

export function Cell({
  value,
  rowIndex,
  colIndex,
  searchQueryRef,
  onUpdate,
  isAutocomplete = false,
  values = [],
  filePath,
  columnName,
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
    const datalistId = useMemo(() => "dl-" + Math.random().toString(36).substring(2, 9), []);
    return (
      <Fragment>
        <input
          ref={inputRef}
          class="tablite-cell-input"
          value={editValue}
          list={isAutocomplete ? datalistId : undefined}
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
        {isAutocomplete && (
          <datalist id={datalistId}>
            {(values || []).map((val) => (
              <option key={val} value={val} />
            ))}
          </datalist>
        )}
      </Fragment>
    );
  }

  const sq = searchQueryRef.current ?? "";
  const isMatch = sq.length > 0 && value.toLowerCase().includes(sq.toLowerCase());

  const handleCellClick = (e: MouseEvent) => {
    if (isAutocomplete && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const globalApp = (window as any).app;
      if (globalApp && value && typeof value === 'string' && value.trim()) {
        const resolvedLink = resolveWikiLink(globalApp, value.trim(), columnName || "");
        globalApp.workspace.openLinkText(resolvedLink, filePath || "", true);
      }
    }
  };

  const handleCellMouseOver = (e: MouseEvent) => {
    if (isAutocomplete && (e.ctrlKey || e.metaKey)) {
      const globalApp = (window as any).app;
      if (globalApp && value && typeof value === 'string' && value.trim()) {
        const resolvedLink = resolveWikiLink(globalApp, value.trim(), columnName || "");
        if (resolvedLink) {
          globalApp.workspace.trigger("hover-link", {
            event: e,
            source: "tablite-csv-view",
            hoverParent: e.currentTarget as HTMLElement,
            targetEl: e.target as HTMLElement,
            linktext: resolvedLink,
            sourcePath: filePath || "",
          });
        }
      }
    }
  };

  return (
    <div
      class={`tablite-cell ${isMatch ? "tablite-cell-match" : ""} ${isAutocomplete ? "sqlseal-wikilink-cell" : ""}`}
      onDblClick={() => {
        setEditValue(value);
        setEditing(true);
      }}
      onClick={handleCellClick}
      onMouseOver={handleCellMouseOver}
    >
      {value || "\u00A0"}
    </div>
  );
}
