import { App, Notice, TFile, TFolder, requestUrl } from "obsidian";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import TablitePlugin from "../../../../../main";
import {
  ReceiptDraft,
  ReceiptItem,
  ParsedLine,
  RedactionShape,
  loadDrafts,
  saveDrafts,
  saveTransaction,
  parseReceiptLine,
  formatNumber,
  simulateScanAI,
  ensureDirectoryExists,
  validateSavePath,
  sanitizeFilename
} from "../utils/dbUtils";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}


interface ReceiptRedactionEditorProps {
  app: App;
  imagePath: string;
  initialShapes: RedactionShape[];
  onSave: (shapes: RedactionShape[], redactedBlob: Blob) => void;
  onCancel: () => void;
}

function ReceiptRedactionEditor({ app, imagePath, initialShapes, onSave, onCancel }: ReceiptRedactionEditorProps) {
  const [tool, setTool] = useState<"drag" | "box" | "circle">("box");
  const [toggle, setToggle] = useState<"original" | "redacted">("redacted");
  const [shapes, setShapes] = useState<RedactionShape[]>(initialShapes);
  
  // Pan and Zoom
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag/Pan state
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  
  // Draw state
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [currentDrawPos, setCurrentDrawPos] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const resourceUrl = app.vault.adapter.getResourcePath(imagePath);

  // Load Image
  useEffect(() => {
    const img = new Image();
    img.src = resourceUrl;
    img.onload = () => {
      setImgElement(img);
      setImageLoaded(true);
      // Auto-fit image to container size
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth || 360;
        const containerHeight = 300; // fixed editor height
        const scale = Math.min(containerWidth / img.naturalWidth, containerHeight / img.naturalHeight, 1);
        setZoom(scale > 0 ? scale : 1);
        // Center the image
        setPanX(Math.max(0, (containerWidth - img.naturalWidth * scale) / 2));
        setPanY(Math.max(0, (containerHeight - img.naturalHeight * scale) / 2));
      }
    };
  }, [imagePath]);

  // Redraw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement || !imageLoaded) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw original image
    ctx.drawImage(imgElement, 0, 0);

    // Draw redacted shapes if toggle is set to "redacted"
    if (toggle === "redacted") {
      ctx.fillStyle = "black";
      shapes.forEach(shape => {
        if (shape.type === "box") {
          ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        } else if (shape.type === "circle") {
          ctx.beginPath();
          const cx = shape.x + shape.width / 2;
          const cy = shape.y + shape.height / 2;
          const rx = Math.abs(shape.width / 2);
          const ry = Math.abs(shape.height / 2);
          ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
          ctx.fill();
        }
      });

      // Draw current drawing shape preview
      if (isDrawing && drawStart.current && currentDrawPos) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.strokeStyle = "red";
        ctx.lineWidth = Math.max(2, 2 / zoom); // scale outline line width
        
        const sx = drawStart.current.x;
        const sy = drawStart.current.y;
        const cx = currentDrawPos.x;
        const cy = currentDrawPos.y;

        if (tool === "box") {
          const x = Math.min(sx, cx);
          const y = Math.min(sy, cy);
          const w = Math.abs(sx - cx);
          const h = Math.abs(sy - cy);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        } else if (tool === "circle") {
          const w = cx - sx;
          const h = cy - sy;
          const rx = Math.abs(w / 2);
          const ry = Math.abs(h / 2);
          const cenX = sx + w / 2;
          const cenY = sy + h / 2;

          ctx.beginPath();
          ctx.ellipse(cenX, cenY, rx, ry, 0, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }, [imgElement, imageLoaded, shapes, toggle, isDrawing, currentDrawPos, tool, zoom]);

  // Pointer Event Handlers
  const handlePointerDown = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);

    if (tool === "drag") {
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX,
        panY
      };
    } else {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;

      drawStart.current = { x: canvasX, y: canvasY };
      setCurrentDrawPos({ x: canvasX, y: canvasY });
      setIsDrawing(true);
    }
  };

  const handlePointerMove = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === "drag" && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPanX(dragStart.current.panX + dx);
      setPanY(dragStart.current.panY + dy);
    } else if (isDrawing && drawStart.current) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;

      setCurrentDrawPos({ x: canvasX, y: canvasY });
    }
  };

  const handlePointerUp = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.releasePointerCapture(e.pointerId);

    if (tool === "drag") {
      dragStart.current = null;
    } else if (isDrawing && drawStart.current && currentDrawPos) {
      setIsDrawing(false);

      const sx = drawStart.current.x;
      const sy = drawStart.current.y;
      const cx = currentDrawPos.x;
      const cy = currentDrawPos.y;

      const w = cx - sx;
      const h = cy - sy;

      if (Math.abs(w) > 5 && Math.abs(h) > 5) {
        const newShape: RedactionShape = {
          type: tool === "box" ? "box" : "circle",
          x: tool === "box" ? Math.min(sx, cx) : sx,
          y: tool === "box" ? Math.min(sy, cy) : sy,
          width: tool === "box" ? Math.abs(w) : w,
          height: tool === "box" ? Math.abs(h) : h
        };
        setShapes([...shapes, newShape]);
      }
      drawStart.current = null;
      setCurrentDrawPos(null);
    }
  };

  const handleWheel = (e: any) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      setZoom(z => Math.min(5, z * zoomFactor));
    } else {
      setZoom(z => Math.max(0.2, z / zoomFactor));
    }
  };

  const clearAllShapes = () => {
    const confirmed = typeof window !== "undefined" && (window as any).confirm ? (window as any).confirm("Are you sure you want to clear all redactions for this image?") : true;
    if (confirmed) {
      setShapes([]);
    }
  };

  const handleDone = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement || !imageLoaded) {
      onCancel();
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = imgElement.naturalWidth;
    exportCanvas.height = imgElement.naturalHeight;

    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      onCancel();
      return;
    }

    exportCtx.drawImage(imgElement, 0, 0);

    exportCtx.fillStyle = "black";
    shapes.forEach(shape => {
      if (shape.type === "box") {
        exportCtx.fillRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === "circle") {
        exportCtx.beginPath();
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        const rx = Math.abs(shape.width / 2);
        const ry = Math.abs(shape.height / 2);
        exportCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        exportCtx.fill();
      }
    });

    exportCanvas.toBlob(blob => {
      if (blob) {
        onSave(shapes, blob);
      } else {
        new Notice("Failed to generate redacted image blob");
        onCancel();
      }
    }, "image/png");
  };

  return (
    <div className="redaction-editor">
      <div className="redaction-toolbar">
        <div className="tool-group">
          <button
            className={`button ${tool === "drag" ? "mod-active" : ""}`}
            onClick={() => setTool("drag")}
            title="Drag & Pan View"
          >
            ✋ Drag
          </button>
          <button
            className={`button ${tool === "box" ? "mod-active" : ""}`}
            onClick={() => setTool("box")}
            title="Draw Rectangle Block"
          >
            ⬛ Shape Box
          </button>
          <button
            className={`button ${tool === "circle" ? "mod-active" : ""}`}
            onClick={() => setTool("circle")}
            title="Draw Circle Block"
          >
            ⏺️ Circle
          </button>
        </div>

        <div className="toggle-group">
          <span className="toggle-label">Toggle:</span>
          <button
            className={`button ${toggle === "original" ? "mod-active" : ""}`}
            onClick={() => setToggle("original")}
          >
            Original
          </button>
          <button
            className={`button ${toggle === "redacted" ? "mod-active" : ""}`}
            onClick={() => setToggle("redacted")}
          >
            Redacted
          </button>
        </div>

        <button className="button danger-btn" onClick={clearAllShapes}>
          Clear
        </button>
      </div>

      <div
        ref={containerRef}
        className="redaction-canvas-container"
        onWheel={handleWheel}
        style={{
          position: "relative",
          width: "100%",
          height: "300px",
          overflow: "hidden",
          background: "#1e1e1e",
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "4px",
          cursor: tool === "drag" ? (dragStart.current ? "grabbing" : "grab") : "crosshair"
        }}
      >
        {!imageLoaded ? (
          <div className="loading-placeholder" style={{ color: "#aaa", textAlign: "center", padding: "100px" }}>
            Loading Image...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={imgElement?.naturalWidth}
            height={imgElement?.naturalHeight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: "absolute",
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: "0 0",
              touchAction: "none"
            }}
          />
        )}
      </div>

      <div className="redaction-actions" style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button mod-cta" onClick={handleDone}>
          Done Editing
        </button>
      </div>
    </div>
  );
}

const getStorageItem = (appInstance: any, key: string): string | null => {
  try {
    if (appInstance && typeof appInstance.loadLocalStorage === "function") {
      return appInstance.loadLocalStorage(key);
    }
    const win = typeof window !== "undefined" ? (window as any) : null;
    return win?.localStorage ? win.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const setStorageItem = (appInstance: any, key: string, val: string): void => {
  try {
    if (appInstance && typeof appInstance.saveLocalStorage === "function") {
      appInstance.saveLocalStorage(key, val);
      return;
    }
    const win = typeof window !== "undefined" ? (window as any) : null;
    if (win?.localStorage) {
      win.localStorage.setItem(key, val);
    }
  } catch {
    // ignore storage errors
  }
};

interface ReceiptScannerProps {
  app: App;
  plugin: TablitePlugin;
  onClose?: () => void;
}

export function ReceiptScanner({ app, plugin, onClose }: ReceiptScannerProps) {
  // --- States ---
  const [drafts, setDrafts] = useState<ReceiptDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [savePath, setSavePath] = useState<string>("Finance/transactions_YYYY.csv");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // API Settings States
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [apiProvider, setApiProvider] = useState<"claude" | "gemini" | "openrouter">(plugin.settings.scannerApiProvider || "gemini");
  const [apiKey, setApiKey] = useState<string>(plugin.settings.scannerApiKey || "");
  const [apiModel, setApiModel] = useState<string>(plugin.settings.scannerApiModel || "gemini-2.5-flash");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Custom ID Generator settings states
  const [txnIdPrefix, setTxnIdPrefix] = useState<string>(plugin.settings.scannerTxnIdPrefix || "TXN_BCAZ");
  const [itemIdPrefix, setItemIdPrefix] = useState<string>(plugin.settings.scannerItemIdPrefix || "ITM");
  const [idUseSeparator, setIdUseSeparator] = useState<boolean>(plugin.settings.scannerIdUseSeparator !== false);
  const [idSeparator, setIdSeparator] = useState<string>(plugin.settings.scannerIdSeparator || "_");
  const [idSuffixType, setIdSuffixType] = useState<"4numbers" | "4letters" | "4mixed">(plugin.settings.scannerIdSuffixType || "4numbers");

  useEffect(() => {
    if (showSettingsModal) {
      setApiProvider(plugin.settings.scannerApiProvider || "gemini");
      setApiKey(plugin.settings.scannerApiKey || "");
      setApiModel(plugin.settings.scannerApiModel || "gemini-2.5-flash");
      setTxnIdPrefix(plugin.settings.scannerTxnIdPrefix || "TXN_BCAZ");
      setItemIdPrefix(plugin.settings.scannerItemIdPrefix || "ITM");
      setIdUseSeparator(plugin.settings.scannerIdUseSeparator !== false);
      setIdSeparator(plugin.settings.scannerIdSeparator || "_");
      setIdSuffixType(plugin.settings.scannerIdSuffixType || "4numbers");
    }
  }, [showSettingsModal, plugin.settings]);

  // Camera States
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  // Autocomplete suggestions
  const [availableMerchants, setAvailableMerchants] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [savePathError, setSavePathError] = useState<string | null>(null);
  const [allCsvFiles, setAllCsvFiles] = useState<string[]>([]);
  const [wikiItemNames, setWikiItemNames] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [editorScrollTop, setEditorScrollTop] = useState<number>(0);

  // Column width states (persisted via Obsidian App localStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = getStorageItem(app, "receipt-scanner-sidebar-width");
    return saved ? parseInt(String(saved), 10) || 220 : 220;
  });
  const [mediaWidth, setMediaWidth] = useState<number>(() => {
    const saved = getStorageItem(app, "receipt-scanner-media-width");
    return saved ? parseInt(String(saved), 10) || 360 : 360;
  });

  // Mobile navigation active tab state
  const [activeMobileTab, setActiveMobileTab] = useState<"drafts" | "scanner" | "items">("scanner");

  // Track control/meta keypresses for wiki hover link highlights
  const [ctrlPressed, setCtrlPressed] = useState<boolean>(false);

  // Privacy Redaction & Panning Editor States
  const [expandedImagePath, setExpandedImagePath] = useState<string | null>(null);
  const [globalToggleMode, setGlobalToggleMode] = useState<"original" | "redacted">("redacted");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.key === "Control" || e.key === "Meta") {
        setCtrlPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setCtrlPressed(false);
      }
    };
    const handleBlur = () => {
      setCtrlPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Sync overlay scroll position when the overlay mounts/renders
  useEffect(() => {
    if (ctrlPressed && editorRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = editorRef.current.scrollTop;
      overlayRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, [ctrlPressed]);

  // Save column widths when they change
  useEffect(() => {
    setStorageItem(app, "receipt-scanner-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth, app]);

  useEffect(() => {
    setStorageItem(app, "receipt-scanner-media-width", mediaWidth.toString());
  }, [mediaWidth, app]);

  // Sidebar drag to resize
  const handleSidebarMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(150, Math.min(400, startWidth + deltaX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Media panel drag to resize
  const handleMediaMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = mediaWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(250, Math.min(600, startWidth + deltaX));
      setMediaWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const subtotalsRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<number | null>(null);

  // --- Initialize drafts & suggestion lists ---
  useEffect(() => {
    const init = async () => {
      const loaded = await loadDrafts(app);
      setDrafts(loaded);
      if (loaded.length > 0) {
        setActiveDraftId(loaded[0].id);
      } else {
        // Create initial draft if none exist
        createNewDraft(loaded);
      }
    };
    init();
  }, [app]);

  // Validate savePath
  useEffect(() => {
    const res = validateSavePath(app, savePath);
    if (!res.isValid) {
      setSavePathError(res.error || "Invalid save directory path");
    } else {
      setSavePathError(null);
    }
  }, [app, savePath]);

  // List all CSV/TSV files in the vault for autocomplete
  useEffect(() => {
    try {
      const files = app.vault.getFiles()
        .filter(f => f.extension === "csv" || f.extension === "tsv")
        .map(f => f.path);
      setAllCsvFiles(files);
    } catch (e) {
      console.error("Failed to list CSV files in vault", e);
    }
  }, [app]);

  // Load available item names from all potential "items" directories for autocomplete suggestions
  const loadWikiItems = async () => {
    const year = new Date().getFullYear().toString();
    const resolvedPath = savePath.replace(/YYYY/g, year);
    let parentPath = "";
    const lastSlash = resolvedPath.lastIndexOf("/");
    if (lastSlash !== -1) {
      parentPath = resolvedPath.substring(0, lastSlash);
    }

    const candidateDirs = [
      "wiki/items",
      "wiki/Items",
      parentPath ? `${parentPath}/items` : "",
      parentPath ? `${parentPath}/Items` : "",
      "items",
      "Items"
    ].filter(Boolean);

    const uniqueItemNames = new Set<string>();

    for (const dir of candidateDirs) {
      try {
        if (await app.vault.adapter.exists(dir)) {
          const folder = app.vault.getFolderByPath(dir);
          if (folder) {
            folder.children.forEach(child => {
              if (child instanceof TFile && child.extension === "md") {
                uniqueItemNames.add(child.basename);
              }
            });
          }
        }
      } catch (err) {
        console.error(`Failed to load wiki items from directory: ${dir}`, err);
      }
    }

    setWikiItemNames(Array.from(uniqueItemNames));
  };

  useEffect(() => {
    loadWikiItems();
  }, [app, savePath]);

  // Load available merchants and categories based on the parent folder of the save path
  useEffect(() => {
    const loadSuggestions = async () => {
      const year = new Date().getFullYear().toString();
      const resolvedPath = savePath.replace(/YYYY/g, year);
      let parentPath = "";
      const lastSlash = resolvedPath.lastIndexOf("/");
      if (lastSlash !== -1) {
        parentPath = resolvedPath.substring(0, lastSlash);
      }

      const merchantsPath = parentPath ? `${parentPath}/merchants.csv` : "merchants.csv";
      const budgetPath = parentPath ? `${parentPath}/budget.csv` : "budget.csv";

      try {
        if (await app.vault.adapter.exists(merchantsPath)) {
          const content = await app.vault.adapter.read(merchantsPath);
          const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
          // Skip header row
          if (lines.length > 1) {
            const list: string[] = [];
            for (let i = 1; i < lines.length; i++) {
              // Get the first column before any comma (merchant name)
              // Handle quotes
              const line = lines[i];
              let merchantName = "";
              if (line.startsWith('"')) {
                const match = line.match(/^"([^"]+)"/);
                if (match) merchantName = match[1];
              } else {
                merchantName = line.split(",")[0];
              }
              if (merchantName && !list.includes(merchantName)) {
                list.push(merchantName);
              }
            }
            setAvailableMerchants(list);
          }
        }
      } catch (e) {
        console.error("Failed to load merchant suggestions", e);
      }

      try {
        if (await app.vault.adapter.exists(budgetPath)) {
          const content = await app.vault.adapter.read(budgetPath);
          const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            const list: string[] = [];
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i];
              // Budget schema: month, category, budgeted_amount, spent_amount, remaining_amount
              // Category is 2nd column
              const parts = line.split(",");
              if (parts.length > 1) {
                let cat = parts[1].trim();
                if (cat.startsWith('"') && cat.endsWith('"')) {
                  cat = cat.substring(1, cat.length - 1);
                }
                if (cat && !list.includes(cat)) {
                  list.push(cat);
                }
              }
            }
            setAvailableCategories(list);
          }
        }
      } catch (e) {
        console.error("Failed to load category suggestions", e);
      }
    };

    loadSuggestions();
  }, [app, savePath]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // --- Find Active Draft ---
  const activeDraft = useMemo(() => {
    return drafts.find(d => d.id === activeDraftId) || null;
  }, [drafts, activeDraftId]);

  // --- Parsed lines & totals ---
  const parsedLines = useMemo((): ParsedLine[] => {
    if (!activeDraft) return [];
    return activeDraft.rawItemsText.split("\n").map(parseReceiptLine);
  }, [activeDraft?.rawItemsText]);

  const totals = useMemo(() => {
    let totalItems = 0;
    let totalPrice = 0;
    const list: ReceiptItem[] = [];

    parsedLines.forEach(line => {
      if (line.qty !== null && line.price !== null && line.subtotal !== null && line.name) {
        totalItems += line.qty;
        totalPrice += line.subtotal;
        list.push({
          qty: line.qty,
          name: line.name,
          price: line.price,
          subtotal: line.subtotal
        });
      }
    });

    return { totalItems, totalPrice, itemsList: list };
  }, [parsedLines]);

  // --- Scroll Synchronization ---
  const handleEditorScroll = () => {
    if (editorRef.current) {
      const scrollTop = editorRef.current.scrollTop;
      const scrollLeft = editorRef.current.scrollLeft;
      if (subtotalsRef.current) {
        subtotalsRef.current.scrollTop = scrollTop;
        subtotalsRef.current.scrollLeft = scrollLeft;
      }
      if (overlayRef.current) {
        overlayRef.current.scrollTop = scrollTop;
        overlayRef.current.scrollLeft = scrollLeft;
      }
      setEditorScrollTop(scrollTop);
    }
  };

  const createNewDraft = (currentDrafts?: ReceiptDraft[]) => {
    const list = currentDrafts || drafts;
    const today = new Date().toISOString().substring(0, 10);
    const newDraft: ReceiptDraft = {
      id: "draft_" + Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      date: today,
      time: new Date().toTimeString().substring(0, 5),
      merchant: "",
      category: "",
      rawItemsText: "",
      imagePaths: [],
      redactedPaths: {},
      redactions: {}
    };
    const updated = [newDraft, ...list];
    setDrafts(updated);
    setActiveDraftId(newDraft.id);
    queueAutoSave(updated);
    new Notice("New draft created");
  };

  const updateActiveDraft = (updates: Partial<ReceiptDraft>) => {
    if (!activeDraftId) return;
    const updated = drafts.map(d => {
      if (d.id === activeDraftId) {
        return {
          ...d,
          ...updates,
          updatedAt: Date.now()
        };
      }
      return d;
    });
    setDrafts(updated);
    queueAutoSave(updated);
  };

  const handleSaveRedaction = async (imgPath: string, shapes: RedactionShape[], redactedBlob: Blob) => {
    if (!activeDraft) return;

    const parentDir = "draft/assets";
    await ensureDirectoryExists(app, parentDir);

    const originalFilename = imgPath.substring(imgPath.lastIndexOf("/") + 1);
    const dotIdx = originalFilename.lastIndexOf(".");
    const baseName = dotIdx !== -1 ? originalFilename.substring(0, dotIdx) : originalFilename;
    const cleanBaseName = baseName.replace(/_redacted$/, "");
    const redactedFilename = `${cleanBaseName}_redacted.png`;
    const redactedPath = `${parentDir}/${redactedFilename}`;

    try {
      const arrayBuffer = await redactedBlob.arrayBuffer();
      await app.vault.adapter.writeBinary(redactedPath, arrayBuffer);

      const updatedRedactedPaths = {
        ...(activeDraft.redactedPaths || {}),
        [imgPath]: redactedPath
      };

      const updatedRedactions = {
        ...(activeDraft.redactions || {}),
        [imgPath]: shapes
      };

      updateActiveDraft({
        redactedPaths: updatedRedactedPaths,
        redactions: updatedRedactions
      });

      new Notice("Redaction saved!");
      setExpandedImagePath(null); // collapse editor
    } catch (err) {
      console.error("Failed to save redacted image file", err);
      new Notice("✕ Failed to save redacted image.");
    }
  };

  const deleteActiveDraft = async () => {
    if (!activeDraft) return;
    const confirmed = typeof window !== "undefined" && (window as any).confirm ? (window as any).confirm("Are you sure you want to delete this draft and all its temp images?") : true;
    if (!confirmed) return;

    // Clean up draft files in vault
    for (const imgPath of activeDraft.imagePaths) {
      try {
        if (await app.vault.adapter.exists(imgPath)) {
          await app.vault.adapter.remove(imgPath);
        }
        // Also check if there's a redacted version
        const redactedPath = activeDraft.redactedPaths?.[imgPath];
        if (redactedPath && (await app.vault.adapter.exists(redactedPath))) {
          await app.vault.adapter.remove(redactedPath);
        }
      } catch (err) {
        console.error("Failed to delete draft image: " + imgPath, err);
      }
    }

    const updated = drafts.filter(d => d.id !== activeDraftId);
    setDrafts(updated);
    if (updated.length > 0) {
      setActiveDraftId(updated[0].id);
    } else {
      createNewDraft(updated);
    }
    await saveDrafts(app, updated);
    new Notice("Draft deleted");
  };

  const queueAutoSave = (updatedDrafts: ReceiptDraft[]) => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(async () => {
      await saveDrafts(app, updatedDrafts);
    }, 800) as any;
  };

  // --- Time Grouping Helper ---
  const groupedDrafts = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    const todayList: ReceiptDraft[] = [];
    const yesterdayList: ReceiptDraft[] = [];
    const olderList: ReceiptDraft[] = [];

    drafts.forEach(d => {
      if (d.createdAt >= startOfToday) {
        todayList.push(d);
      } else if (d.createdAt >= startOfYesterday) {
        yesterdayList.push(d);
      } else {
        olderList.push(d);
      }
    });

    return {
      today: todayList,
      yesterday: yesterdayList,
      older: olderList
    };
  }, [drafts]);

  // --- Media & Camera Handling ---
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || !activeDraft) return;

    await addFiles(target.files);
    target.value = ""; // reset input
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer || !activeDraft) return;
    await addFiles(e.dataTransfer.files);
  };

  const addFiles = async (fileList: FileList) => {
    if (!activeDraft) return;
    const parentDir = "draft/assets";
    await ensureDirectoryExists(app, parentDir);

    const newPaths = [...activeDraft.imagePaths];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith("image/")) {
        new Notice("Only image files are supported");
        continue;
      }

      const timestamp = Date.now();
      const filename = `${activeDraft.id}_${timestamp}_${file.name.replace(/\s+/g, "_")}`;
      const destPath = `${parentDir}/${filename}`;

      try {
        const arrayBuffer = await file.arrayBuffer();
        await app.vault.adapter.writeBinary(destPath, arrayBuffer);
        newPaths.push(destPath);
        new Notice(`Added image: ${file.name}`);
      } catch (err) {
        console.error("Failed to write image " + file.name, err);
        new Notice("Error adding image: " + file.name);
      }
    }

    updateActiveDraft({ imagePaths: newPaths });
  };

  const deleteImage = async (pathToDelete: string) => {
    if (!activeDraft) return;
    try {
      if (await app.vault.adapter.exists(pathToDelete)) {
        await app.vault.adapter.remove(pathToDelete);
      }
    } catch (err) {
      console.error("Failed to delete draft image: " + pathToDelete, err);
    }
    const updatedPaths = activeDraft.imagePaths.filter(p => p !== pathToDelete);
    updateActiveDraft({ imagePaths: updatedPaths });
  };

  // Camera stream controls
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    if (cameraActive) {
      const initCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
          });
          activeStream = stream;
          setCameraStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Camera access failed, trying fallback", err);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            activeStream = stream;
            setCameraStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } catch (errFallback) {
            console.error("All camera accesses failed", errFallback);
            new Notice("Failed to access camera");
            setCameraActive(false);
          }
        }
      };
      // Wait for rendering to complete so video element is mounted in DOM
      const timer = window.setTimeout(() => {
        void initCamera();
      }, 50);
      return () => {
        window.clearTimeout(timer);
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [cameraActive]);

  const startCamera = () => {
    setCameraActive(true);
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const captureSnapshot = () => {
    if (!videoRef.current || !activeDraft) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const parentDir = "draft/assets";
        await ensureDirectoryExists(app, parentDir);

        const filename = `${activeDraft.id}_camera_${Date.now()}.png`;
        const destPath = `${parentDir}/${filename}`;

        try {
          const arrayBuffer = await blob.arrayBuffer();
          await app.vault.adapter.writeBinary(destPath, arrayBuffer);

          const updatedPaths = [...activeDraft.imagePaths, destPath];
          updateActiveDraft({ imagePaths: updatedPaths });
          new Notice("Snapshot captured");
          stopCamera();
        } catch (err) {
          console.error("Failed to save camera snapshot", err);
          new Notice("Failed to save camera snapshot");
        }
      }, "image/png");
    }
  };

  const handleSaveApiSettings = async () => {
    plugin.settings.scannerApiProvider = apiProvider;
    plugin.settings.scannerApiKey = apiKey;
    plugin.settings.scannerApiModel = apiModel;
    plugin.settings.scannerTxnIdPrefix = txnIdPrefix;
    plugin.settings.scannerItemIdPrefix = itemIdPrefix;
    plugin.settings.scannerIdUseSeparator = idUseSeparator;
    plugin.settings.scannerIdSeparator = idSeparator;
    plugin.settings.scannerIdSuffixType = idSuffixType;
    await plugin.saveSettings();
    setShowSettingsModal(false);
    new Notice("✓ API settings saved successfully!");
  };

  // --- Scan AI Trigger ---
  const handleScanAI = async () => {
    if (!activeDraft) return;

    // Privacy safety check: verify all images are redacted
    if (activeDraft.imagePaths.length > 0) {
      const allRedacted = activeDraft.imagePaths.every(path => activeDraft.redactedPaths?.[path]);
      if (!allRedacted) {
        new Notice("✕ Cannot scan: Please redact all images first to protect your privacy.");
        return;
      }
    }

    setIsScanning(true);
    new Notice("Analyzing receipt images...");

    const provider = plugin.settings.scannerApiProvider;
    const key = plugin.settings.scannerApiKey;
    const model = plugin.settings.scannerApiModel;

    // Find first redacted path if there are images
    let redactedPath: string | null = null;
    if (activeDraft.imagePaths.length > 0) {
      const firstPath = activeDraft.imagePaths[0];
      redactedPath = activeDraft.redactedPaths?.[firstPath] || null;
    }

    // Fallback to simulator if no API key is provided
    if (!key) {
      new Notice("No API key configured. Running simulator fallback...");
      window.setTimeout(() => {
        let matchedFilename: string | null = null;
        if (redactedPath) {
          matchedFilename = redactedPath.substring(redactedPath.lastIndexOf("/") + 1);
        }
        const parsedData = simulateScanAI(matchedFilename);
        updateActiveDraft({
          date: parsedData.date,
          merchant: parsedData.merchant,
          category: parsedData.category,
          rawItemsText: parsedData.rawItemsText
        });
        setIsScanning(false);
        new Notice("Scan complete (Simulated)!");
      }, 1200);
      return;
    }

    try {
      if (!redactedPath) {
        new Notice("✕ Cannot scan: No receipt images attached to scan.");
        setIsScanning(false);
        return;
      }

      // Read the image file from vault
      const imageBuffer = await app.vault.adapter.readBinary(redactedPath);
      const base64Image = arrayBufferToBase64(imageBuffer);

      // Prompt to instruct the LLM
      const prompt = `You are a receipt parsing assistant. Analyze this receipt image. Extract:
1. The transaction date in YYYY-MM-DD format (if not clear or missing, use today's date: ${new Date().toISOString().substring(0, 10)}).
2. The merchant name (e.g. Starbucks, McDonald's, Indomaret, etc. keep it short).
3. The shopping category (e.g. Food & Beverage, Groceries, Transportation, Utilities, Shopping, Entertainment, etc.).
4. The list of items.

You MUST return a JSON object with these EXACT keys:
{
  "date": "YYYY-MM-DD",
  "merchant": "Merchant Name",
  "category": "Category Name",
  "rawItemsText": "Qtyx ItemName Price\\n..."
}

Rules for rawItemsText:
- Format each item on a new line: [Quantity]x [Item Name] [Unit/Subtotal Price]
- Quantity must be a number followed by 'x' (e.g. 2x) or just a number if quantity is 1 (e.g. 1x or 2x). Actually, the format is [Quantity]x [Item Name] [Price]
- The Price must be numeric and not contain any thousands separators (dots or commas) (e.g. 20000 instead of 20.000 or 20,000).
- Example of rawItemsText:
2x Ayam Bakar 20000
1x Aqua 3500
1x Headset MX20 150000

Make sure you do not output any markdown block formatting (like \`\`\`json), just output the raw JSON string.`;

      let responseText = "";

      if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent?key=${key}`;
        const response = await requestUrl({
          url,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: base64Image
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });
        
        if (response.status !== 200) {
          throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
        }
        
        const resJson = JSON.parse(response.text);
        const textCandidate = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textCandidate) {
          throw new Error("No content candidate returned from Gemini API.");
        }
        responseText = textCandidate;

      } else if (provider === "claude") {
        const url = "https://api.anthropic.com/v1/messages";
        const response = await requestUrl({
          url,
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: model || "claude-3-5-sonnet-latest",
            max_tokens: 1024,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: base64Image
                    }
                  },
                  {
                    type: "text",
                    text: prompt
                  }
                ]
              }
            ]
          })
        });

        if (response.status !== 200) {
          throw new Error(`Claude API returned status ${response.status}: ${response.text}`);
        }

        const resJson = JSON.parse(response.text);
        const textCandidate = resJson.content?.[0]?.text;
        if (!textCandidate) {
          throw new Error("No text response returned from Claude API.");
        }
        responseText = textCandidate;

      } else if (provider === "openrouter") {
        const url = "https://openrouter.ai/api/v1/chat/completions";
        const response = await requestUrl({
          url,
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model || "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: prompt
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${base64Image}`
                    }
                  }
                ]
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (response.status !== 200) {
          throw new Error(`OpenRouter API returned status ${response.status}: ${response.text}`);
        }

        const resJson = JSON.parse(response.text);
        const textCandidate = resJson.choices?.[0]?.message?.content;
        if (!textCandidate) {
          throw new Error("No completion response returned from OpenRouter API.");
        }
        responseText = textCandidate;
      }

      // Cleanup codeblocks markdown if any (e.g. ```json ... ```)
      let cleanText = responseText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```[a-zA-Z]*\n?/, "");
        cleanText = cleanText.replace(/```$/, "");
        cleanText = cleanText.trim();
      }

      const parsedJSON = JSON.parse(cleanText);
      let parsedDate = parsedJSON.date || new Date().toISOString().substring(0, 10);
      let parsedTime = "";
      
      if (parsedDate.includes(" ")) {
        const parts = parsedDate.split(" ");
        parsedDate = parts[0];
        parsedTime = parts[1] || "";
      }

      updateActiveDraft({
        date: parsedDate,
        time: parsedTime || activeDraft?.time || new Date().toTimeString().substring(0, 5),
        merchant: parsedJSON.merchant || "",
        category: parsedJSON.category || "",
        rawItemsText: parsedJSON.rawItemsText || ""
      });

      new Notice("✓ Scan complete!");
    } catch (err) {
      console.error("Failed real Scan AI request", err);
      new Notice(`✕ Scan failed: ${err.message || err.toString()}`);
    } finally {
      setIsScanning(false);
    }
  };

  // --- Grand save transaction ---
  const handleSaveTransaction = async () => {
    if (!activeDraft) return;
    if (!activeDraft.merchant) {
      new Notice("Merchant name is required to save.");
      return;
    }
    if (!activeDraft.category) {
      new Notice("Category is required to save.");
      return;
    }
    if (totals.itemsList.length === 0) {
      new Notice("At least one valid item is required to save.");
      return;
    }

    try {
      new Notice("Saving transaction database...");
      await saveTransaction(app, activeDraft, savePath, totals.itemsList, {
        scannerTxnIdPrefix: plugin.settings.scannerTxnIdPrefix,
        scannerItemIdPrefix: plugin.settings.scannerItemIdPrefix,
        scannerIdUseSeparator: plugin.settings.scannerIdUseSeparator,
        scannerIdSeparator: plugin.settings.scannerIdSeparator,
        scannerIdSuffixType: plugin.settings.scannerIdSuffixType
      });

      // Reload item names autocomplete pool
      await loadWikiItems();

      // Clean up drafts list
      const remainingDrafts = drafts.filter(d => d.id !== activeDraftId);
      setDrafts(remainingDrafts);

      // Remove current draft entry from draft registry file
      await saveDrafts(app, remainingDrafts);

      if (remainingDrafts.length > 0) {
        setActiveDraftId(remainingDrafts[0].id);
      } else {
        createNewDraft(remainingDrafts);
      }

      new Notice("✓ Transaction saved successfully!");
    } catch (err) {
      console.error("Failed to save transaction", err);
      new Notice("✕ Failed to save transaction. Check developer console.");
    }
  };

  // --- Helper relative time text ---
  const getRelativeTimeText = (timestamp: number): string => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  // --- Copy live items text to clipboard ---
  const handleCopyItems = () => {
    if (!activeDraft) return;
    navigator.clipboard.writeText(activeDraft.rawItemsText);
    new Notice("Copied items list to clipboard");
  };

  // --- Text Editor Autocomplete & Navigation Event Handlers ---
  const handleTextareaInputOrSelection = (e: any) => {
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart;
    setCursorPosition(pos);

    const text = textarea.value;
    const textBefore = text.substring(0, pos);
    const linesBefore = textBefore.split("\n");
    const currentLine = linesBefore[linesBefore.length - 1];

    // Find prefix (e.g. "2x " or "2 ") and get item name query
    let searchTerm = currentLine.trim();
    const matchX = currentLine.match(/^\d+\s*[xX]\s+(.*)/);
    if (matchX) {
      searchTerm = matchX[1].trim();
    } else {
      const matchNum = currentLine.match(/^\d+\s+(.*)/);
      if (matchNum) {
        searchTerm = matchNum[1].trim();
      }
    }

    if (searchTerm.length >= 1) {
      const filtered = wikiItemNames.filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        name.toLowerCase() !== searchTerm.toLowerCase()
      ).slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    if (!activeDraft) return;
    const textarea = editorRef.current;
    if (!textarea) return;

    const pos = cursorPosition;
    const text = activeDraft.rawItemsText;
    const textBefore = text.substring(0, pos);
    const linesBefore = textBefore.split("\n");
    const lineIndex = linesBefore.length - 1;
    const lines = text.split("\n");
    const currentLine = lines[lineIndex];

    let prefix = "";
    const matchX = currentLine.match(/^(\d+\s*[xX]\s+)/);
    if (matchX) {
      prefix = matchX[1];
    } else {
      const matchNum = currentLine.match(/^(\d+\s+)/);
      if (matchNum) {
        prefix = matchNum[1];
      }
    }

    lines[lineIndex] = prefix + suggestion;
    const nextText = lines.join("\n");
    updateActiveDraft({ rawItemsText: nextText });
    setSuggestions([]);

    // Refocus the textarea and set cursor index to end of suggestion
    window.setTimeout(() => {
      textarea.focus();
      let newPos = 0;
      for (let i = 0; i < lineIndex; i++) {
        newPos += lines[i].length + 1; // +1 for newline
      }
      newPos += prefix.length + suggestion.length;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
      setCursorPosition(newPos);
    }, 50);
  };

  const extractItemNameFromLine = (line: string): string | null => {
    return parseReceiptLine(line).name;
  };

  const openWiki = (itemName: string) => {
    const year = new Date().getFullYear().toString();
    const resolvedPath = savePath.replace(/YYYY/g, year);
    let parentPath = "";
    const lastSlash = resolvedPath.lastIndexOf("/");
    if (lastSlash !== -1) {
      parentPath = resolvedPath.substring(0, lastSlash);
    }

    const candidateDirs = [
      "wiki/items",
      "wiki/Items",
      parentPath ? `${parentPath}/items` : "",
      parentPath ? `${parentPath}/Items` : "",
      "items",
      "Items"
    ].filter(Boolean);

    let file: TFile | null = null;
    for (const dir of candidateDirs) {
      const notePath = `${dir}/${sanitizeFilename(itemName)}.md`;
      const checkFile = app.vault.getFileByPath(notePath);
      if (checkFile instanceof TFile) {
        file = checkFile;
        break;
      }
    }

    if (file) {
      app.workspace.getLeaf("tab").openFile(file);
      new Notice(`Opening wiki note: ${itemName}`);
    } else {
      new Notice(`Note for "${itemName}" does not exist yet.`);
    }
  };

  const handleLinkMouseOver = (e: MouseEvent, itemName: string) => {
    if (e.ctrlKey || e.metaKey) {
      const globalApp = (window as any).app;
      if (globalApp) {
        const year = new Date().getFullYear().toString();
        const resolvedPath = savePath.replace(/YYYY/g, year);
        let parentPath = "";
        const lastSlash = resolvedPath.lastIndexOf("/");
        if (lastSlash !== -1) {
          parentPath = resolvedPath.substring(0, lastSlash);
        }

        const candidateDirs = [
          "wiki/items",
          "wiki/Items",
          parentPath ? `${parentPath}/items` : "",
          parentPath ? `${parentPath}/Items` : "",
          "items",
          "Items"
        ].filter(Boolean);

        let file: TFile | null = null;
        for (const dir of candidateDirs) {
          const notePath = `${dir}/${sanitizeFilename(itemName)}.md`;
          const checkFile = app.vault.getFileByPath(notePath);
          if (checkFile instanceof TFile) {
            file = checkFile;
            break;
          }
        }

        const linktext = file ? file.path : itemName;

        globalApp.workspace.trigger("hover-link", {
          event: e,
          source: "receipt-scanner",
          hoverParent: e.currentTarget as HTMLElement,
          targetEl: e.target as HTMLElement,
          linktext: linktext,
          sourcePath: resolvedPath,
        });
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const isPressed = e.ctrlKey || e.metaKey;
    if (isPressed !== ctrlPressed) {
      setCtrlPressed(isPressed);
    }
  };

  const handleMouseLeave = () => {
    setCtrlPressed(false);
  };

  const handleTextareaClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const textarea = e.currentTarget as HTMLTextAreaElement;
      const pos = textarea.selectionStart;
      const text = textarea.value;

      let lineStart = text.lastIndexOf("\n", pos - 1) + 1;
      let lineEnd = text.indexOf("\n", pos);
      if (lineEnd === -1) lineEnd = text.length;

      const lineText = text.substring(lineStart, lineEnd);
      const name = extractItemNameFromLine(lineText);

      if (name) {
        openWiki(name);
      }
    }
  };

  const currentLineIndex = useMemo(() => {
    if (!activeDraft) return 0;
    const textBefore = activeDraft.rawItemsText.substring(0, cursorPosition);
    return textBefore.split("\n").length - 1;
  }, [activeDraft?.rawItemsText, cursorPosition]);

  // Render
  return (
    <div className={`receipt-scanner-container ${isFullscreen ? "receipt-scanner-fullscreen" : ""}`}>
      {/* Header Panel */}
      <div className="receipt-scanner-header">
        <h2>🧾 Receipt Scanner</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            className="button"
            onClick={() => setShowSettingsModal(true)}
            title="API Settings"
          >
            ⚙️ Settings
          </button>
          <button
            className="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Toggle fullscreen overlay"
          >
            {isFullscreen ? "🗖 Normal View" : "🔍 Fullscreen"}
          </button>
        </div>
      </div>

      {/* Mobile Tab Navigation */}
      {activeDraft && (
        <div className="receipt-scanner-mobile-tabs">
          <button
            className={`mobile-tab-btn ${activeMobileTab === "drafts" ? "is-active" : ""}`}
            onClick={() => setActiveMobileTab("drafts")}
          >
            📁 Drafts
          </button>
          <button
            className={`mobile-tab-btn ${activeMobileTab === "scanner" ? "is-active" : ""}`}
            onClick={() => setActiveMobileTab("scanner")}
          >
            📷 Scanner
          </button>
          <button
            className={`mobile-tab-btn ${activeMobileTab === "items" ? "is-active" : ""}`}
            onClick={() => setActiveMobileTab("items")}
          >
            📝 Items
          </button>
        </div>
      )}

      {/* Main Column Layout */}
      <div className={`receipt-scanner-body ${activeDraft ? "has-active-draft" : ""} active-tab-${activeMobileTab}`}>
        {/* 1️⃣ Draft Explorer (Left Column) */}
        <div
          className="receipt-scanner-sidebar"
          style={{
            width: `${sidebarWidth}px`,
            minWidth: `${sidebarWidth}px`,
            maxWidth: `${sidebarWidth}px`
          }}
        >
          <button className="btn-new-draft" onClick={() => createNewDraft()}>
            + New Draft
          </button>

          {/* Today Group */}
          {groupedDrafts.today.length > 0 && (
            <div className="receipt-scanner-time-section">
              <div className="receipt-scanner-section-title">Today</div>
              {groupedDrafts.today.map(draft => (
                <div
                  key={draft.id}
                  className={`receipt-scanner-draft-card ${draft.id === activeDraftId ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveDraftId(draft.id);
                    setActiveMobileTab("scanner");
                  }}
                >
                  <div className="draft-title">{draft.merchant || "New Draft"}</div>
                  <div className="draft-subtitle">{getRelativeTimeText(draft.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Yesterday Group */}
          {groupedDrafts.yesterday.length > 0 && (
            <div className="receipt-scanner-time-section">
              <div className="receipt-scanner-section-title">Yesterday</div>
              {groupedDrafts.yesterday.map(draft => (
                <div
                  key={draft.id}
                  className={`receipt-scanner-draft-card ${draft.id === activeDraftId ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveDraftId(draft.id);
                    setActiveMobileTab("scanner");
                  }}
                >
                  <div className="draft-title">{draft.merchant || "New Draft"}</div>
                  <div className="draft-subtitle">{getRelativeTimeText(draft.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Older Group */}
          {groupedDrafts.older.length > 0 && (
            <div className="receipt-scanner-time-section">
              <div className="receipt-scanner-section-title">Older</div>
              {groupedDrafts.older.map(draft => (
                <div
                  key={draft.id}
                  className={`receipt-scanner-draft-card ${draft.id === activeDraftId ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveDraftId(draft.id);
                    setActiveMobileTab("scanner");
                  }}
                >
                  <div className="draft-title">{draft.merchant || "New Draft"}</div>
                  <div className="draft-subtitle">{getRelativeTimeText(draft.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Divider Slider */}
        <div className="receipt-scanner-resizer" onMouseDown={handleSidebarMouseDown} />

        {activeDraft && (
          <>
            {/* 2️⃣ Media & Metadata Panel (Middle Column) */}
            <div
              className="receipt-scanner-media-metadata"
              style={{
                width: `${mediaWidth}px`,
                minWidth: `${mediaWidth}px`,
                maxWidth: `${mediaWidth}px`
              }}
            >
              {/* Image Drag/Drop Box */}
              {!cameraActive ? (
                <div
                  className="receipt-scanner-media-box"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={triggerFileSelect}
                >
                  <div className="media-icon">📁</div>
                  <div className="media-text">Drag & drop receipt image or click to browse</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <div style={{ marginTop: "12px" }}>
                    <button
                      className="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startCamera();
                      }}
                    >
                      📷 Use Camera
                    </button>
                  </div>
                </div>
              ) : (
                /* Camera block */
                <div className="receipt-scanner-camera-view">
                  <video ref={videoRef} autoPlay playsInline />
                  <div className="camera-actions">
                    <button className="button mod-cta" onClick={captureSnapshot}>
                      📸 Capture
                    </button>
                    <button className="button" onClick={stopCamera}>
                      ✕ Close
                    </button>
                  </div>
                </div>
              )}

              {/* Uploaded Images List & Inline Paint Redaction Editors */}
              {activeDraft.imagePaths.length > 0 && (
                <div className="receipt-scanner-images-list-container" style={{ margin: "16px 0" }}>
                  <div className="list-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ margin: 0 }}>🔽 Image List (Click row to edit)</h4>
                    <div className="toggle-group" style={{ display: "flex", gap: "4px", fontSize: "12px" }}>
                      <button
                        className={`button ${globalToggleMode === "original" ? "mod-active" : ""}`}
                        style={{ padding: "2px 6px", fontSize: "10px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGlobalToggleMode("original");
                        }}
                      >
                        Original
                      </button>
                      <button
                        className={`button ${globalToggleMode === "redacted" ? "mod-active" : ""}`}
                        style={{ padding: "2px 6px", fontSize: "10px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGlobalToggleMode("redacted");
                        }}
                      >
                        Redacted
                      </button>
                    </div>
                  </div>

                  <div className="receipt-scanner-images-rows">
                    {activeDraft.imagePaths.map(path => {
                      const filename = path.substring(path.lastIndexOf("/") + 1);
                      const isRedacted = !!activeDraft.redactedPaths?.[path];
                      const isExpanded = expandedImagePath === path;

                      // Display src based on toggle mode
                      const displayPath = (globalToggleMode === "redacted" && activeDraft.redactedPaths?.[path])
                        ? activeDraft.redactedPaths[path]
                        : path;
                      const displaySrc = app.vault.adapter.getResourcePath(displayPath);

                      return (
                        <div key={path} className={`image-row-item ${isExpanded ? "is-expanded" : ""}`} style={{ marginBottom: "12px" }}>
                          <div
                            className="image-row-header"
                            onClick={() => setExpandedImagePath(isExpanded ? null : path)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px",
                              background: "var(--background-secondary)",
                              border: "1px solid var(--background-modifier-border)",
                              borderRadius: "4px",
                              cursor: "pointer"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <img
                                src={displaySrc}
                                alt="preview"
                                style={{ width: "24px", height: "24px", objectFit: "cover", borderRadius: "2px" }}
                              />
                              <span className="image-filename" style={{ fontSize: "13px", fontWeight: "bold" }}>{filename}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span
                                className={`redaction-status-badge ${isRedacted ? "status-redacted" : "status-pending"}`}
                                style={{
                                  fontSize: "11px",
                                  padding: "2px 6px",
                                  borderRadius: "10px",
                                  background: isRedacted ? "var(--background-modifier-success)" : "var(--background-modifier-error-hover)",
                                  color: "white"
                                }}
                              >
                                {isRedacted ? "✅ Redacted" : "⚠️ Pending"}
                              </span>
                              <button
                                className="btn-delete-row-img"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isExpanded) setExpandedImagePath(null);
                                  deleteImage(path);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: "14px"
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="image-row-expanded-editor" style={{ marginTop: "8px", padding: "8px", border: "1px solid var(--background-modifier-border)", borderRadius: "4px" }}>
                              <ReceiptRedactionEditor
                                app={app}
                                imagePath={path}
                                initialShapes={activeDraft.redactions?.[path] || []}
                                onSave={(shapes, blob) => handleSaveRedaction(path, shapes, blob)}
                                onCancel={() => setExpandedImagePath(null)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Metadata Form */}
              <div className="receipt-scanner-meta-inputs">
                {activeDraft.imagePaths.length > 0 && (
                  <div
                    className={`privacy-warning-banner ${
                      activeDraft.imagePaths.every(path => activeDraft.redactedPaths?.[path]) ? "warning-ready" : "warning-pending"
                    }`}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      marginBottom: "10px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      textAlign: "center",
                      color: "white",
                      background: activeDraft.imagePaths.every(path => activeDraft.redactedPaths?.[path])
                        ? "var(--background-modifier-success)"
                        : "var(--background-modifier-error-hover)"
                    }}
                  >
                    {activeDraft.imagePaths.every(path => activeDraft.redactedPaths?.[path])
                      ? "✅ Redacted Ready"
                      : "⚠️ WARNING: Image not yet redacted!"}
                  </div>
                )}

                <button
                  className={`button mod-cta ${isScanning ? "is-loading" : ""}`}
                  style={{ width: "100%", padding: "10px" }}
                  onClick={handleScanAI}
                  disabled={isScanning}
                >
                  🔍 {isScanning ? "Scanning..." : "Scan AI"}
                </button>

                {/* Date Input */}
                <div className="receipt-scanner-field">
                  <label>Date</label>
                  <div className="input-row">
                    <input
                      type="date"
                      value={activeDraft.date}
                      onChange={(e) => updateActiveDraft({ date: (e.target as HTMLInputElement).value })}
                    />
                  </div>
                </div>

                {/* Merchant Input with suggestion datalist */}
                <div className="receipt-scanner-field">
                  <label>Merchant</label>
                  <div className="input-row">
                    <input
                      type="text"
                      list="merchants-list"
                      placeholder="e.g. Starbucks, Indomaret"
                      value={activeDraft.merchant}
                      onChange={(e) => updateActiveDraft({ merchant: (e.target as HTMLInputElement).value })}
                    />
                    <button
                      onClick={() => updateActiveDraft({ merchant: activeDraft.merchant.trim() })}
                      title="Quick check merchant"
                    >
                      +
                    </button>
                  </div>
                  <datalist id="merchants-list">
                    {availableMerchants.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                {/* Category Input with suggestion datalist */}
                <div className="receipt-scanner-field">
                  <label>Category</label>
                  <div className="input-row">
                    <input
                      type="text"
                      list="categories-list"
                      placeholder="e.g. Food & Beverage, Groceries"
                      value={activeDraft.category}
                      onChange={(e) => updateActiveDraft({ category: (e.target as HTMLInputElement).value })}
                    />
                    <button
                      onClick={() => updateActiveDraft({ category: activeDraft.category.trim() })}
                      title="Quick check category"
                    >
                      +
                    </button>
                  </div>
                  <datalist id="categories-list">
                    {availableCategories.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Time Input */}
                <div className="receipt-scanner-field">
                  <label>Time</label>
                  <div className="input-row">
                    <input
                      type="time"
                      value={activeDraft.time || ""}
                      onChange={(e) => updateActiveDraft({ time: (e.target as HTMLInputElement).value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Media Divider Slider */}
            <div className="receipt-scanner-resizer" onMouseDown={handleMediaMouseDown} />

            {/* 3️⃣ Items Parser Panel (Right Column) */}
            <div className="receipt-scanner-items-parser">
              <div className="items-header-row">
                <h3>📝 Items</h3>
                <button className="button" onClick={handleCopyItems}>
                  📋 Copy
                </button>
              </div>

              {/* Split Editor Container */}
              <div
                className="receipt-scanner-split-text"
                style={{ position: "relative" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <textarea
                  ref={editorRef}
                  className="split-editor"
                  placeholder="Format: [Qty]x [Item Name] [Price]&#10;e.g:&#10;2x Ayam bakar 20000&#10;1x Aqua 3500&#10;&#10;💡 Hold Ctrl + Click on a line to open its Wiki Note!"
                  value={activeDraft.rawItemsText}
                  onInput={(e) => {
                    updateActiveDraft({ rawItemsText: (e.target as HTMLTextAreaElement).value });
                    handleTextareaInputOrSelection(e);
                  }}
                  onClick={handleTextareaClick}
                  onKeyUp={handleTextareaInputOrSelection}
                  onScroll={handleEditorScroll}
                  spellcheck={false}
                />

                <div ref={subtotalsRef} className="split-subtotals">
                  {parsedLines.map((line, idx) => {
                    if (line.qty !== null && line.price !== null && line.subtotal !== null) {
                      return <div key={idx}>= {formatNumber(line.subtotal)}</div>;
                    }
                    return <div key={idx}>&nbsp;</div>;
                  })}
                </div>

                {/* Transparent overlay for Wiki Hover links highlights (active when Ctrl is pressed) */}
                {ctrlPressed && (
                  <div ref={overlayRef} className="split-editor-overlay">
                    {parsedLines.map((line, idx) => {
                      if (!line.original.trim()) {
                        return <div key={idx}>&nbsp;</div>;
                      }

                      const extractedName = extractItemNameFromLine(line.original);
                      if (extractedName) {
                        const nameIndex = line.original.indexOf(extractedName);
                        if (nameIndex !== -1) {
                          const before = line.original.substring(0, nameIndex);
                          const after = line.original.substring(nameIndex + extractedName.length);
                          return (
                            <div key={idx}>
                              <span style={{ color: "transparent" }}>{before}</span>
                              <span
                                className="wiki-link-overlay-name"
                                onClick={() => openWiki(extractedName)}
                                onMouseOver={(e) => handleLinkMouseOver(e, extractedName)}
                              >
                                {extractedName}
                              </span>
                              <span style={{ color: "transparent" }}>{after}</span>
                            </div>
                          );
                        }
                      }

                      return (
                        <div key={idx} style={{ color: "transparent" }}>
                          {line.original}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Floating Suggestions */}
                {suggestions.length > 0 && (
                  <div
                    className="receipt-scanner-autocomplete-popup"
                    style={{ top: `${12 + (currentLineIndex + 1) * 22 - editorScrollTop}px` }}
                  >
                    <div className="popup-header">Suggestions:</div>
                    {suggestions.map(s => (
                      <div
                        key={s}
                        className="popup-item"
                        onClick={() => selectSuggestion(s)}
                      >
                        • {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grandtotal Banner */}
              <div className="receipt-scanner-grandtotal-banner">
                <span>Grandtotal ({totals.totalItems} items):</span>
                <span>= {formatNumber(totals.totalPrice)}</span>
              </div>

              {/* Save Dir & Footer Actions */}
              <div className="receipt-scanner-column-footer">
                <div className="save-dir-field">
                  <label>
                    Save Directory
                    {savePathError && (
                      <span style={{ color: "var(--text-error)", marginLeft: "8px", fontSize: "0.85em" }}>
                        ({savePathError})
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    list="save-paths-list"
                    className={savePathError ? "is-invalid" : ""}
                    value={savePath}
                    onChange={(e) => setSavePath((e.target as HTMLInputElement).value)}
                    placeholder="e.g. Finance/transactions_YYYY.csv"
                  />
                  <datalist id="save-paths-list">
                    {allCsvFiles.map(path => (
                      <option key={path} value={path} />
                    ))}
                  </datalist>
                </div>

                <div className="footer-actions">
                  <button className="btn-delete" onClick={deleteActiveDraft}>
                    🗑️ Delete
                  </button>
                  <button
                    className="btn-save"
                    onClick={handleSaveTransaction}
                    disabled={!!savePathError || !activeDraft.merchant || !activeDraft.category || totals.itemsList.length === 0}
                  >
                    Save ✓
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* API Configuration Settings Modal Overlay */}
      {showSettingsModal && (
        <div className="receipt-scanner-settings-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="receipt-scanner-settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ API Settings</h3>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <h4 style={{ margin: "0 0 12px 0", borderBottom: "1px dashed var(--background-modifier-border)", paddingBottom: "4px", color: "var(--text-accent)" }}>🔑 API Credentials</h4>
              
              <div className="receipt-scanner-field" style={{ marginBottom: "12px" }}>
                <label>AI Provider</label>
                <div className="input-row">
                  <select
                    value={apiProvider}
                    onChange={(e) => {
                      const val = (e.target as HTMLSelectElement).value as "claude" | "gemini" | "openrouter";
                      setApiProvider(val);
                      // Provide default models based on selected provider
                      if (val === "gemini") {
                        setApiModel("gemini-2.5-flash");
                      } else if (val === "claude") {
                        setApiModel("claude-3-5-sonnet-latest");
                      } else if (val === "openrouter") {
                        setApiModel("google/gemini-2.5-flash");
                      }
                    }}
                  >
                    <option value="gemini">Gemini</option>
                    <option value="claude">Claude</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>
              </div>

              <div className="receipt-scanner-field" style={{ marginBottom: "12px" }}>
                <label>Model Name</label>
                <div className="input-row">
                  <input
                    type="text"
                    placeholder={
                      apiProvider === "gemini" 
                        ? "gemini-2.5-flash" 
                        : apiProvider === "claude" 
                        ? "claude-3-5-sonnet-latest" 
                        : "google/gemini-2.5-flash"
                    }
                    value={apiModel}
                    onChange={(e) => setApiModel((e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>

              <div className="receipt-scanner-field" style={{ marginBottom: "20px" }}>
                <label>API Key</label>
                <div className="input-row">
                  <input
                    type={showApiKey ? "text" : "password"}
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey((e.target as HTMLInputElement).value)}
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? "Hide Key" : "Show Key"}
                    style={{ minWidth: "40px" }}
                  >
                    {showApiKey ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              <h4 style={{ margin: "16px 0 12px 0", borderBottom: "1px dashed var(--background-modifier-border)", paddingBottom: "4px", color: "var(--text-accent)" }}>🆔 ID Generator Settings</h4>

              <div className="receipt-scanner-field" style={{ marginBottom: "12px" }}>
                <label>Transaction ID Prefix</label>
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="e.g. TXN_BCAZ"
                    value={txnIdPrefix}
                    onChange={(e) => setTxnIdPrefix((e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>

              <div className="receipt-scanner-field" style={{ marginBottom: "12px" }}>
                <label>Item ID Prefix</label>
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="e.g. ITM"
                    value={itemIdPrefix}
                    onChange={(e) => setItemIdPrefix((e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>

              <div className="receipt-scanner-field" style={{ marginBottom: "12px" }}>
                <label>ID Separator</label>
                <div className="input-row" style={{ alignItems: "center", gap: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "normal", fontSize: "0.9em", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={idUseSeparator}
                      onChange={(e) => setIdUseSeparator((e.target as HTMLInputElement).checked)}
                      style={{ margin: 0, width: "auto", flex: "none", cursor: "pointer" }}
                    />
                    Use Separator
                  </label>
                  {idUseSeparator && (
                    <input
                      type="text"
                      placeholder="e.g. _"
                      value={idSeparator}
                      onChange={(e) => setIdSeparator((e.target as HTMLInputElement).value)}
                      style={{ maxWidth: "60px", textAlign: "center" }}
                    />
                  )}
                </div>
              </div>

              <div className="receipt-scanner-field" style={{ marginBottom: "8px" }}>
                <label>Suffix Format</label>
                <div className="input-row">
                  <select
                    value={idSuffixType}
                    onChange={(e) => setIdSuffixType((e.target as HTMLSelectElement).value as any)}
                  >
                    <option value="4numbers">4 Digits (e.g. 0001)</option>
                    <option value="4letters">4 Letters (e.g. AAAA)</option>
                    <option value="4mixed">4 Mixed Alphanumeric (e.g. 0001-000Z)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="button" onClick={() => setShowSettingsModal(false)}>
                Cancel
              </button>
              <button className="button mod-cta" onClick={handleSaveApiSettings}>
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
