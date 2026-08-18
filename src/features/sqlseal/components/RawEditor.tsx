import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import { Notice } from "obsidian";

interface RawEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  onSwitchToTable: () => void;
  delimiter: string;
  encoding?: string;
  filePath?: string;
}

export function RawEditor({
  value,
  onChange,
  onSwitchToTable,
  delimiter,
  encoding = "utf-8",
  filePath = "",
}: RawEditorProps) {
  const [text, setText] = useState(value);
  const [wordWrap, setWordWrap] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  const lines = text.split("\n");
  const lineCount = lines.length;

  const handleChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      const val = target.value;
      setText(val);
      onChange(val);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Tab key support
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const insertChar = delimiter === "\t" ? "\t" : "  ";
        const nextVal = text.substring(0, start) + insertChar + text.substring(end);
        setText(nextVal);
        onChange(nextVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + insertChar.length;
        }, 0);
      }
    },
    [text, delimiter, onChange],
  );

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      new Notice("✓ Copied raw CSV to clipboard");
    } catch {
      new Notice("Failed to copy to clipboard");
    }
  }, [text]);

  return (
    <div class="tablite-raw-editor-container">
      <div class="tablite-raw-toolbar">
        <div class="tablite-raw-toolbar-left">
          <button
            class="tablite-btn tablite-btn-primary"
            onClick={onSwitchToTable}
            title="Switch back to interactive spreadsheet table grid"
          >
            📊 Switch to Table View
          </button>
          <span class="tablite-separator" />
          <label class="tablite-toggle-label" title="Wrap long lines">
            <input
              type="checkbox"
              checked={wordWrap}
              onChange={(e) => setWordWrap((e.target as HTMLInputElement).checked)}
            />
            <span>Word Wrap</span>
          </label>
          <span class="tablite-separator" />
          <button class="tablite-btn" onClick={handleCopy} title="Copy entire raw content">
            📋 Copy Raw CSV
          </button>
        </div>
        <div class="tablite-raw-toolbar-right">
          <span class="tablite-info">
            Lines: {lineCount.toLocaleString()} | Chars: {text.length.toLocaleString()} | Format: {delimiter === "\t" ? "TSV (Tab)" : "CSV (Comma)"}
          </span>
        </div>
      </div>
      <div class="tablite-raw-body">
        <div ref={lineNumbersRef} class="tablite-raw-gutter">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} class="tablite-raw-line-number">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          class={`tablite-raw-textarea ${wordWrap ? "wrap" : "nowrap"}`}
          value={text}
          onInput={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellcheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Paste or type raw CSV / TSV text here..."
        />
      </div>
    </div>
  );
}
