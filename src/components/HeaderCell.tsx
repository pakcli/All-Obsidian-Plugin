import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import type { Column } from "@tanstack/react-table";

interface HeaderCellProps {
  name: string;
  colIndex: number;
  column: Column<string[], unknown>;
  onUpdateHeader: (colIndex: number, value: string) => void;
  onResize: (colIndex: number, width: number) => void;
  onMoveColumn: (sourceIndex: number, targetIndex: number) => void;
}

export function HeaderCell({
  name,
  colIndex,
  column,
  onUpdateHeader,
  onResize,
  onMoveColumn,
}: HeaderCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const [selectOpen, setSelectOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!selectOpen) return;
    const onClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick, true);
    return () => document.removeEventListener("mousedown", onClick, true);
  }, [selectOpen]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== name) onUpdateHeader(colIndex, editValue);
  }, [colIndex, editValue, name, onUpdateHeader]);

  const sortDir = column.getIsSorted();
  const sortIndicator = sortDir === "asc" ? " ▲" : sortDir === "desc" ? " ▼" : "";
  const meta = (column.columnDef.meta as {
    dataType?: string;
    filterVariant?: "text" | "select" | "numberRange" | "dateRange";
  } | undefined) ?? { dataType: "string", filterVariant: "text" };
  const dataType = String(meta.dataType ?? "string");

  const onMouseDown = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resizing.current = true;
      startX.current = event.clientX;
      startWidth.current = column.getSize();

      const onMouseMove = (nextEvent: MouseEvent) => {
        if (!resizing.current) return;
        const diff = nextEvent.clientX - startX.current;
        onResize(colIndex, Math.max(50, startWidth.current + diff));
      };

      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colIndex, column, onResize],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        class="tablite-header-input"
        value={editValue}
        onInput={(event) => setEditValue((event.target as HTMLInputElement).value)}
        onBlur={commitEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitEdit();
          if (event.key === "Escape") {
            setEditing(false);
            setEditValue(name);
          }
        }}
      />
    );
  }

  const rawFilterValue = column.getFilterValue();
  const filterValue = typeof rawFilterValue === "string" ? rawFilterValue : "";
  const selectValues = Array.isArray(rawFilterValue) ? rawFilterValue as string[] : [];
  const rangeValue = (typeof rawFilterValue === "object" && rawFilterValue != null && !Array.isArray(rawFilterValue)
    ? rawFilterValue
    : {}) as { min?: string; max?: string };
  const facetedValues = Array.from(column.getFacetedUniqueValues().keys())
    .map((value) => String(value))
    .filter((value) => value.trim().length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const toggleSelectValue = useCallback((val: string) => {
    const next = selectValues.includes(val)
      ? selectValues.filter((v) => v !== val)
      : [...selectValues, val];
    column.setFilterValue(next.length > 0 ? next : undefined);
  }, [column, selectValues]);

  return (
    <div
      class="tablite-header-cell"
      draggable
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/tablite-column", String(colIndex));
        event.dataTransfer!.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer!.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceIndex = Number(event.dataTransfer?.getData("text/tablite-column"));
        if (!Number.isNaN(sourceIndex)) onMoveColumn(sourceIndex, colIndex);
      }}
    >
      <div class="tablite-header-top">
        <span
          class="tablite-header-name"
          onClick={() => column.toggleSorting(undefined, true)}
          onDblClick={() => {
            setEditValue(name);
            setEditing(true);
          }}
        >
          {name}
          {sortIndicator}
        </span>
        <span class="tablite-header-type">{dataType}</span>
        <div class="tablite-resize-handle" onMouseDown={onMouseDown} />
      </div>
      {meta.filterVariant === "select" ? (
        <div ref={dropdownRef} class="tablite-multiselect" onClick={(event) => event.stopPropagation()}>
          <div
            class="tablite-multiselect-trigger tablite-column-filter"
            onClick={() => setSelectOpen(!selectOpen)}
          >
            {selectValues.length === 0
              ? "All"
              : selectValues.length === 1
                ? selectValues[0]
                : `${selectValues.length} selected`}
          </div>
          {selectOpen && (
            <div class="tablite-multiselect-dropdown">
              {selectValues.length > 0 && (
                <div
                  class="tablite-multiselect-item tablite-multiselect-clear"
                  onClick={() => {
                    column.setFilterValue(undefined);
                    setSelectOpen(false);
                  }}
                >
                  Clear all
                </div>
              )}
              {facetedValues.map((value) => (
                <label key={value} class="tablite-multiselect-item">
                  <input
                    type="checkbox"
                    checked={selectValues.includes(value)}
                    onChange={() => toggleSelectValue(value)}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : meta.filterVariant === "numberRange" ? (
        <div class="tablite-range-filter" onClick={(event) => event.stopPropagation()}>
          <input
            class="tablite-column-filter tablite-range-input"
            type="number"
            placeholder="Min"
            value={rangeValue.min ?? ""}
            onInput={(event) => {
              column.setFilterValue({
                min: (event.target as HTMLInputElement).value || undefined,
                max: rangeValue.max || undefined,
              });
            }}
          />
          <span class="tablite-range-sep">-</span>
          <input
            class="tablite-column-filter tablite-range-input"
            type="number"
            placeholder="Max"
            value={rangeValue.max ?? ""}
            onInput={(event) => {
              column.setFilterValue({
                min: rangeValue.min || undefined,
                max: (event.target as HTMLInputElement).value || undefined,
              });
            }}
          />
        </div>
      ) : meta.filterVariant === "dateRange" ? (
        <div class="tablite-range-filter" onClick={(event) => event.stopPropagation()}>
          <div class="tablite-date-pick">
            <input
              class="tablite-column-filter tablite-range-input tablite-date-display"
              type="text"
              readOnly
              placeholder="Min"
              value={rangeValue.min ?? ""}
              onClick={(event) => {
                const hidden = (event.target as HTMLElement).nextElementSibling as HTMLInputElement;
                hidden?.showPicker();
              }}
            />
            <input
              class="tablite-date-picker"
              type="date"
              tabIndex={-1}
              value={rangeValue.min ?? ""}
              onInput={(event) => {
                column.setFilterValue({
                  min: (event.target as HTMLInputElement).value || undefined,
                  max: rangeValue.max || undefined,
                });
              }}
            />
          </div>
          <span class="tablite-range-sep">-</span>
          <div class="tablite-date-pick">
            <input
              class="tablite-column-filter tablite-range-input tablite-date-display"
              type="text"
              readOnly
              placeholder="Max"
              value={rangeValue.max ?? ""}
              onClick={(event) => {
                const hidden = (event.target as HTMLElement).nextElementSibling as HTMLInputElement;
                hidden?.showPicker();
              }}
            />
            <input
              class="tablite-date-picker"
              type="date"
              tabIndex={-1}
              value={rangeValue.max ?? ""}
              onInput={(event) => {
                column.setFilterValue({
                  min: rangeValue.min || undefined,
                  max: (event.target as HTMLInputElement).value || undefined,
                });
              }}
            />
          </div>
        </div>
      ) : (
        <input
          class="tablite-column-filter"
          type="text"
          placeholder="Filter..."
          value={filterValue}
          onInput={(event) => {
            column.setFilterValue((event.target as HTMLInputElement).value || undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}
