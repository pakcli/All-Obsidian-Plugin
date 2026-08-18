import { useEffect, useRef } from "preact/hooks";

interface FindReplaceBarProps {
  isOpen: boolean;
  showReplace: boolean;
  searchQuery: string;
  replaceQuery: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  selectedColumn: number | null;
  headers: string[];
  matchIndex: number;
  matchCount: number;
  onSearchChange: (query: string) => void;
  onReplaceChange: (query: string) => void;
  onToggleMatchCase: () => void;
  onToggleMatchWholeWord: () => void;
  onColumnChange: (colIndex: number | null) => void;
  onToggleReplaceRow: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export function FindReplaceBar({
  isOpen,
  showReplace,
  searchQuery,
  replaceQuery,
  matchCase,
  matchWholeWord,
  selectedColumn,
  headers,
  matchIndex,
  matchCount,
  onSearchChange,
  onReplaceChange,
  onToggleMatchCase,
  onToggleMatchWholeWord,
  onColumnChange,
  onToggleReplaceRow,
  onNextMatch,
  onPrevMatch,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: FindReplaceBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (showReplace && replaceInputRef.current && document.activeElement !== searchInputRef.current) {
        replaceInputRef.current.focus();
        replaceInputRef.current.select();
      } else if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    }
  }, [isOpen, showReplace]);

  if (!isOpen) return null;

  return (
    <div class="tablite-find-replace-bar" onClick={(e) => e.stopPropagation()}>
      <div class="tablite-find-row">
        <button
          type="button"
          class="tablite-fr-toggle-btn"
          title={showReplace ? "Hide Replace" : "Show Replace (Ctrl+H)"}
          onClick={onToggleReplaceRow}
        >
          <span class={`tablite-fr-chevron ${showReplace ? "expanded" : ""}`}>▶</span>
        </button>

        <div class="tablite-fr-input-wrap">
          <input
            ref={searchInputRef}
            type="text"
            class="tablite-fr-input"
            placeholder="Find..."
            value={searchQuery}
            onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) onPrevMatch();
                else onNextMatch();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button
            type="button"
            class={`tablite-fr-opt-btn ${matchCase ? "active" : ""}`}
            title="Match Case (Aa)"
            onClick={onToggleMatchCase}
          >
            Aa
          </button>
          <button
            type="button"
            class={`tablite-fr-opt-btn ${matchWholeWord ? "active" : ""}`}
            title="Match Whole Word (\b)"
            onClick={onToggleMatchWholeWord}
          >
            \b
          </button>
        </div>

        <span class="tablite-fr-count">
          {searchQuery ? (matchCount > 0 ? `${matchIndex} of ${matchCount}` : "No results") : ""}
        </span>

        <button
          type="button"
          class="tablite-fr-nav-btn"
          title="Previous Match (Shift+Enter)"
          onClick={onPrevMatch}
          disabled={matchCount === 0}
        >
          ▲
        </button>
        <button
          type="button"
          class="tablite-fr-nav-btn"
          title="Next Match (Enter)"
          onClick={onNextMatch}
          disabled={matchCount === 0}
        >
          ▼
        </button>

        <select
          class="tablite-fr-col-select"
          title="Filter search to specific column"
          value={selectedColumn === null ? "__all__" : String(selectedColumn)}
          onChange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            onColumnChange(val === "__all__" ? null : Number(val));
          }}
        >
          <option value="__all__">All Columns</option>
          {headers.map((h, idx) => (
            <option key={idx} value={String(idx)}>
              Col: {h || `Column ${idx + 1}`}
            </option>
          ))}
        </select>

        <button
          type="button"
          class="tablite-fr-close-btn"
          title="Close (Escape)"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {showReplace && (
        <div class="tablite-replace-row">
          <div class="tablite-fr-spacer" />
          <div class="tablite-fr-input-wrap">
            <input
              ref={replaceInputRef}
              type="text"
              class="tablite-fr-input"
              placeholder="Replace with..."
              value={replaceQuery}
              onInput={(e) => onReplaceChange((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.altKey || e.ctrlKey) onReplaceAll();
                  else onReplaceCurrent();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onClose();
                }
              }}
            />
          </div>

          <div class="tablite-fr-btn-group">
            <button
              type="button"
              class="tablite-fr-action-btn"
              title="Replace Current Match (Enter)"
              onClick={onReplaceCurrent}
              disabled={matchCount === 0}
            >
              Replace
            </button>
            <button
              type="button"
              class="tablite-fr-action-btn tablite-fr-action-all"
              title="Replace All Matches (Alt+Enter)"
              onClick={onReplaceAll}
              disabled={matchCount === 0}
            >
              Replace All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
