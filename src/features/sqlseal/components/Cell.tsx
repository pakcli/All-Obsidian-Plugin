import { useState, useRef, useEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { Fragment } from "preact";
import { resolveWikiLink } from "../utils/wiki";
import { GenericTextSuggest } from "../utils/suggesters";
import { extractYouTubeVideoId, getOrDownloadYtThumbnail } from "../utils/youtubeThumbnail";

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

  const suggestRef = useRef<GenericTextSuggest | null>(null);

  useEffect(() => {
    if (editing && inputRef.current && isAutocomplete) {
      const el = inputRef.current;
      const globalApp = (window as any).app;
      if (globalApp) {
        try {
          suggestRef.current = new GenericTextSuggest(globalApp, el, values || []);
        } catch (e) {
          console.error("Error creating cell suggest:", e);
        }
      }
    }
    return () => {
      suggestRef.current = null;
    };
  }, [editing, isAutocomplete]);

  useEffect(() => {
    if (suggestRef.current) {
      suggestRef.current.setItems(values || []);
    }
  }, [values]);

  if (editing) {
    return (
      <Fragment>
        <input
          ref={inputRef}
          class="tablite-cell-input"
          value={editValue}
          onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
          onBlur={() => {
            window.setTimeout(() => {
              if (inputRef.current) {
                const latestVal = inputRef.current.value;
                setEditing(false);
                if (latestVal !== value) {
                  onUpdate(rowIndex, colIndex, latestVal);
                }
              } else {
                setEditing(false);
              }
            }, 200);
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
      </Fragment>
    );
  }

  const sq = searchQueryRef.current ?? "";
  const isMatch = sq.length > 0 && value.toLowerCase().includes(sq.toLowerCase());

  const isImagePathColumn = columnName === "original_image_path" || columnName === "redacted_image_path";

  const handleCellClick = (e: MouseEvent) => {
    if (isAutocomplete && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const globalApp = (window as any).app;
      if (globalApp && value && typeof value === 'string' && value.trim()) {
        const resolvedLink = resolveWikiLink(globalApp, value.trim(), columnName || "");
        globalApp.workspace.openLinkText(resolvedLink, filePath || "", true);
      }
    } else if (isImagePathColumn && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      const globalApp = (window as any).app;
      if (globalApp && value && typeof value === 'string' && value.trim()) {
        const paths = value.split(";").map(p => p.trim()).filter(Boolean);
        for (const p of paths) {
          const file = globalApp.vault.getFileByPath(p);
          if (file) {
            globalApp.workspace.getLeaf("tab").openFile(file);
          }
        }
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
    } else if (isImagePathColumn && (e.ctrlKey || e.metaKey)) {
      const globalApp = (window as any).app;
      if (globalApp && value && typeof value === 'string' && value.trim()) {
        const paths = value.split(";").map(p => p.trim()).filter(Boolean);
        const firstPath = paths[0];
        if (firstPath) {
          globalApp.workspace.trigger("hover-link", {
            event: e,
            source: "tablite-csv-view",
            hoverParent: e.currentTarget as HTMLElement,
            targetEl: e.target as HTMLElement,
            linktext: firstPath,
            sourcePath: filePath || "",
          });
        }
      }
    }
  };

  const ytVideoId = extractYouTubeVideoId(value);
  const [thumbSrc, setThumbSrc] = useState<string | null>(() =>
    ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg` : null,
  );

  useEffect(() => {
    if (ytVideoId) {
      const globalApp = (window as any).app;
      if (globalApp) {
        getOrDownloadYtThumbnail(globalApp, ytVideoId).then((cachedPath) => {
          if (cachedPath) setThumbSrc(cachedPath);
        });
      }
    }
  }, [ytVideoId]);

  if (ytVideoId) {
    return (
      <div
        class={`tablite-cell tablite-yt-cell ${isMatch ? "tablite-cell-match" : ""}`}
        onDblClick={() => {
          setEditValue(value);
          setEditing(true);
        }}
      >
        <img
          class="tablite-yt-thumb"
          src={thumbSrc || `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`}
          alt="YouTube Thumbnail"
          loading="lazy"
          title={`Click to open YouTube video (${ytVideoId})`}
          onClick={(e) => {
            if (!editing) {
              e.stopPropagation();
              window.open(value, "_blank");
            }
          }}
        />
        <a
          class="tablite-yt-link"
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (editing) e.preventDefault();
          }}
        >
          {value}
        </a>
      </div>
    );
  }

  return (
    <div
      class={`tablite-cell ${isMatch ? "tablite-cell-match" : ""} ${
        isAutocomplete ? "sqlseal-wikilink-cell" : ""
      } ${isImagePathColumn ? "tablite-image-path-cell" : ""}`}
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
