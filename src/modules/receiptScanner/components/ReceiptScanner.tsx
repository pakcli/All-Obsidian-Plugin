import { App, Notice, TFile, TFolder } from "obsidian";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import {
  ReceiptDraft,
  ReceiptItem,
  ParsedLine,
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

interface ReceiptScannerProps {
  app: App;
  onClose?: () => void;
}

export function ReceiptScanner({ app, onClose }: ReceiptScannerProps) {
  // --- States ---
  const [drafts, setDrafts] = useState<ReceiptDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [savePath, setSavePath] = useState<string>("Finance/transactions_YYYY.csv");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);

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

  // Column width states (persisted in localStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("receipt-scanner-sidebar-width");
    return saved ? parseInt(saved, 10) : 220;
  });
  const [mediaWidth, setMediaWidth] = useState<number>(() => {
    const saved = localStorage.getItem("receipt-scanner-media-width");
    return saved ? parseInt(saved, 10) : 360;
  });

  // Mobile navigation active tab state
  const [activeMobileTab, setActiveMobileTab] = useState<"drafts" | "scanner" | "items">("scanner");

  // Track control/meta keypresses for wiki hover link highlights
  const [ctrlPressed, setCtrlPressed] = useState<boolean>(false);

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
    localStorage.setItem("receipt-scanner-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("receipt-scanner-media-width", mediaWidth.toString());
  }, [mediaWidth]);

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

  // --- Draft Management Actions ---
  const createNewDraft = (currentDrafts?: ReceiptDraft[]) => {
    const list = currentDrafts || drafts;
    const today = new Date().toISOString().substring(0, 10);
    const newDraft: ReceiptDraft = {
      id: "draft_" + Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      date: today,
      merchant: "",
      category: "",
      rawItemsText: "",
      imagePaths: []
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

  const deleteActiveDraft = async () => {
    if (!activeDraft) return;
    if (!confirm("Are you sure you want to delete this draft and all its temp images?")) return;

    // Clean up draft files in vault
    for (const imgPath of activeDraft.imagePaths) {
      try {
        if (await app.vault.adapter.exists(imgPath)) {
          await app.vault.adapter.remove(imgPath);
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

  // --- Scan AI Mock Trigger ---
  const handleScanAI = () => {
    if (!activeDraft) return;
    setIsScanning(true);
    new Notice("Analyzing receipt images...");

    setTimeout(() => {
      // Find a filename to use for matching mock templates
      let matchedFilename: string | null = null;
      if (activeDraft.imagePaths.length > 0) {
        const firstPath = activeDraft.imagePaths[0];
        matchedFilename = firstPath.substring(firstPath.lastIndexOf("/") + 1);
      }

      const parsedData = simulateScanAI(matchedFilename);
      updateActiveDraft({
        date: parsedData.date,
        merchant: parsedData.merchant,
        category: parsedData.category,
        rawItemsText: parsedData.rawItemsText
      });
      setIsScanning(false);
      new Notice("Scan complete!");
    }, 1200);
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
      await saveTransaction(app, activeDraft, savePath, totals.itemsList);

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
    setTimeout(() => {
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
        <button
          className="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title="Toggle fullscreen overlay"
        >
          {isFullscreen ? "🗖 Normal View" : "🔍 Fullscreen"}
        </button>
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

              {/* Uploaded Images Preview Thumbnails */}
              {activeDraft.imagePaths.length > 0 && (
                <div className="receipt-scanner-images-preview">
                  {activeDraft.imagePaths.map(path => {
                    const src = app.vault.adapter.getResourcePath(path);
                    return (
                      <div key={path} className="preview-thumbnail">
                        <img src={src} alt="Receipt asset" />
                        <button
                          className="btn-delete-img"
                          onClick={() => deleteImage(path)}
                          title="Delete image"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Metadata Form */}
              <div className="receipt-scanner-meta-inputs">
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
            </div>
          </>
        )}
      </div>

      {/* 4️⃣ Save Dir Footer */}
      {activeDraft && (
        <div className="receipt-scanner-footer">
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
      )}
    </div>
  );
}
