import { App, TFolder } from "obsidian";
import Papa from "papaparse";

export interface RedactionShape {
  type: "box" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReceiptDraft {
  id: string;
  createdAt: number;
  updatedAt: number;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  merchant: string;
  category: string;
  rawItemsText: string;
  imagePaths: string[]; // paths relative to vault root, e.g. "draft/assets/xxx.png"
  redactedPaths?: Record<string, string>; // maps original image path -> redacted image path
  redactions?: Record<string, RedactionShape[]>; // maps original image path -> array of shapes
}

function parseSuffix(suffix: string, type: "4numbers" | "4letters" | "4mixed"): number {
  if (type === "4numbers") {
    return parseInt(suffix, 10) || 0;
  } else if (type === "4letters") {
    let num = 0;
    const clean = suffix.toUpperCase();
    for (let i = 0; i < clean.length; i++) {
      num = num * 26 + (clean.charCodeAt(i) - 65);
    }
    return num;
  } else { // 4mixed
    return parseInt(suffix, 36) || 0;
  }
}

export function getSuffixForIndex(index: number, type: "4numbers" | "4letters" | "4mixed"): string {
  if (type === "4numbers") {
    return (index + 1).toString().padStart(4, "0");
  } else if (type === "4letters") {
    let str = "";
    let temp = index;
    for (let i = 0; i < 4; i++) {
      const digit = temp % 26;
      str = String.fromCharCode(65 + digit) + str;
      temp = Math.floor(temp / 26);
    }
    return str;
  } else { // 4mixed (base 36)
    return (index + 1).toString(36).toUpperCase().padStart(4, "0");
  }
}

export function getNextIdIndex(
  existingIds: string[],
  suffixType: "4numbers" | "4letters" | "4mixed"
): number {
  let maxVal = -1;
  let regex: RegExp;
  if (suffixType === "4numbers") {
    regex = /\d{4}$/;
  } else if (suffixType === "4letters") {
    regex = /[A-Z]{4}$/i;
  } else {
    regex = /[A-Z0-9]{4}$/i;
  }

  for (const id of existingIds) {
    if (!id) continue;
    const match = id.match(regex);
    if (match) {
      const val = parseSuffix(match[0], suffixType);
      let idxVal = val;
      if (suffixType === "4numbers" || suffixType === "4mixed") {
        idxVal = val - 1;
      }
      if (idxVal > maxVal) {
        maxVal = idxVal;
      }
    }
  }
  return maxVal + 1;
}

export interface ReceiptItem {
  qty: number;
  name: string;
  price: number;
  subtotal: number;
}

export interface ParsedLine {
  original: string;
  qty: number | null;
  name: string | null;
  price: number | null;
  subtotal: number | null;
}

const DRAFTS_FILE_PATH = "draft/drafts.json";

/**
 * Ensures a directory and all its parent directories exist in the vault.
 */
export async function ensureDirectoryExists(app: App, dirPath: string): Promise<void> {
  const parts = dirPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current).catch(() => {});
    }
  }
}

/**
 * Loads drafts from draft/drafts.json
 */
export async function loadDrafts(app: App): Promise<ReceiptDraft[]> {
  try {
    if (await app.vault.adapter.exists(DRAFTS_FILE_PATH)) {
      const dataStr = await app.vault.adapter.read(DRAFTS_FILE_PATH);
      if (dataStr.trim()) {
        return JSON.parse(dataStr) as ReceiptDraft[];
      }
    }
  } catch (error) {
    console.error("Failed to load drafts", error);
  }
  return [];
}

/**
 * Saves drafts to draft/drafts.json
 */
export async function saveDrafts(app: App, drafts: ReceiptDraft[]): Promise<void> {
  try {
    const parentDir = "draft";
    await ensureDirectoryExists(app, parentDir);
    await app.vault.adapter.write(DRAFTS_FILE_PATH, JSON.stringify(drafts, null, 2));
  } catch (error) {
    console.error("Failed to save drafts", error);
  }
}

/**
 * Formats a number with period thousands separators (German/Indonesian format)
 */
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Helper to escape CSV columns properly
 */
export function escapeCSV(val: string | number): string {
  const str = val == null ? "" : val.toString();
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parses a single text line into a ReceiptItem structure or returns nulls
 */
export function parseReceiptLine(line: string): ParsedLine {
  const original = line;
  const trimmed = line.trim();
  if (!trimmed) {
    return { original, qty: null, name: null, price: null, subtotal: null };
  }

  // Strip trailing "= ..." if present
  let content = trimmed;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx !== -1) {
    content = trimmed.substring(0, eqIdx).trim();
  }

  const parseNum = (str: string): number => {
    // Strip thousands separators (dots or commas)
    const cleaned = str.replace(/[.,]/g, "");
    return parseInt(cleaned, 10) || 0;
  };

  let qty: number | null = null;
  let price: number | null = null;

  // Price token regex string: >=3 digits, or containing dot/comma separators
  const priceRegexStr = "\\b\\d{3,}[\\d.,]*\\b|\\b\\d+[\\d.,]+\\d+\\b";
  const isPriceToken = (str: string): boolean => {
    const regex = new RegExp("^(" + priceRegexStr + ")$");
    return regex.test(str);
  };

  // 1. Explicit quantity with 'x/X' suffix anywhere on the line
  // e.g. "2x", "2 x", "2X", "2 X", but NOT "x2", "mx20".
  const qtyXRegex = /\b(\d+)\s*[xX]\b/;
  const qtyXMatch = content.match(qtyXRegex);
  if (qtyXMatch) {
    qty = parseInt(qtyXMatch[1], 10);
    content = content.replace(/\b\d+\s*[xX]\b/g, "").trim();
  }

  // 2. Pre-check for raw quantity at the start of the original line BEFORE price matching.
  // We only match it if it is NOT a price token.
  // e.g. in "2 20000 Ayam bakar", the "2" is not a price token, so it's qty.
  if (qty === null) {
    const startNumMatch = content.match(/^(\d+)\s+/);
    if (startNumMatch && !isPriceToken(startNumMatch[1])) {
      qty = parseInt(startNumMatch[1], 10);
      content = content.replace(/^(\d+)\s+/, "").trim();
    }
  }

  // 3. Price matching at boundaries (start or end)
  const startPriceRegex = new RegExp("^(" + priceRegexStr + ")\\s*");
  const endPriceRegex = new RegExp("\\s*(" + priceRegexStr + ")$");

  let startPriceMatch = content.match(startPriceRegex);
  let endPriceMatch = content.match(endPriceRegex);

  if (startPriceMatch) {
    price = parseNum(startPriceMatch[1]);
    content = content.replace(startPriceRegex, "").trim();
  } else if (endPriceMatch) {
    price = parseNum(endPriceMatch[1]);
    content = content.replace(endPriceRegex, "").trim();
  }

  // 4. Post-check for raw quantity if qty is still null
  // We can look for raw number at start or end of the remaining content.
  // We only allow raw number at the end if a price was already found (to avoid matching "iPhone 15" as qty 15).
  if (qty === null) {
    const startNumMatch = content.match(/^(\d+)\s+/);
    const endNumMatch = content.match(/\s+(\d+)$/);

    if (startNumMatch && !isPriceToken(startNumMatch[1])) {
      qty = parseInt(startNumMatch[1], 10);
      content = content.replace(/^(\d+)\s+/, "").trim();
    } else if (endNumMatch && price !== null && !isPriceToken(endNumMatch[1])) {
      qty = parseInt(endNumMatch[1], 10);
      content = content.replace(/\s+(\d+)$/, "").trim();
    }
  }

  // Clean up multiple spaces
  content = content.replace(/\s+/g, " ");

  let name: string | null = null;
  // Safety check: name must contain some alphabetic character
  if (content && /[a-zA-Z]/.test(content)) {
    name = content;
  }

  // Default qty to 1 if we have a name and price, but no qty specified
  if (name && price !== null && qty === null) {
    qty = 1;
  }

  const subtotal = (qty !== null && price !== null) ? qty * price : null;

  return {
    original,
    qty,
    name,
    price,
    subtotal
  };
}

/**
 * Sanitizes an item name to be a valid file name
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

/**
 * Validates a save path
 */
export function validateSavePath(app: App, path: string): { isValid: boolean; error?: string } {
  const trimmed = path.trim();
  if (!trimmed) {
    return { isValid: false, error: "Path cannot be empty" };
  }
  // Must end with .csv or .tsv (case-insensitive)
  if (!/\.(csv|tsv)$/i.test(trimmed)) {
    return { isValid: false, error: "Path must end with .csv or .tsv" };
  }
  // Check for invalid characters in path
  if (/[\\:*?"<>|]/.test(trimmed)) {
    return { isValid: false, error: "Path contains invalid characters" };
  }
  
  // Verify if any parent folder segment is actually a file
  const parts = trimmed.split("/");
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part) continue;
    current = current ? `${current}/${part}` : part;
    const file = app.vault.getAbstractFileByPath(current);
    if (file && !(file instanceof TFolder)) {
      return { isValid: false, error: `"${part}" is a file, not a directory` };
    }
  }
  
  return { isValid: true };
}

/**
 * Simulates AI scanning of files
 */
export function simulateScanAI(filename: string | null): {
  date: string;
  merchant: string;
  category: string;
  rawItemsText: string;
} {
  const today = new Date().toISOString().substring(0, 10);
  const lower = filename ? filename.toLowerCase() : "";

  if (lower.includes("star") || lower.includes("coffee")) {
    return {
      date: today,
      merchant: "Starbucks",
      category: "Food & Beverage",
      rawItemsText: "2x Caramel Macchiato 55000\n1x Butter Croissant 35000",
    };
  }

  if (lower.includes("indo") || lower.includes("super") || lower.includes("grocery")) {
    return {
      date: today,
      merchant: "Indomaret",
      category: "Groceries",
      rawItemsText: "3x Aqua 600ml 4000\n2x Indomie Goreng 3500\n1x Chitato BBQ 12500",
    };
  }

  if (lower.includes("mc") || lower.includes("mac") || lower.includes("burger")) {
    return {
      date: today,
      merchant: "McDonald's",
      category: "Food & Beverage",
      rawItemsText: "2x McSpicy Medium 60000\n1x French Fries L 25000\n1x Coca Cola L 15000",
    };
  }

  if (lower.includes("gas") || lower.includes("fuel") || lower.includes("pertamina")) {
    return {
      date: today,
      merchant: "Pertamina",
      category: "Transportation",
      rawItemsText: "1x Pertamax 12.5L 162500",
    };
  }

  // Random fallback
  const fallbacks = [
    {
      merchant: "Starbucks",
      category: "Food & Beverage",
      rawItemsText: "2x Caramel Macchiato 55000\n1x Butter Croissant 35000",
    },
    {
      merchant: "Indomaret",
      category: "Groceries",
      rawItemsText: "3x Aqua 600ml 4000\n2x Indomie Goreng 3500\n1x Chitato BBQ 12500",
    },
    {
      merchant: "McDonald's",
      category: "Food & Beverage",
      rawItemsText: "2x McSpicy Medium 60000\n1x French Fries L 25000\n1x Coca Cola L 15000",
    },
  ];

  const choice = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  return {
    date: today,
    merchant: choice.merchant,
    category: choice.category,
    rawItemsText: choice.rawItemsText,
  };
}

/**
 * Saves a transaction by promoting files, appending records to database files,
 * updating budgets/merchants, and generating markdown notes.
 */
export async function saveTransaction(
  app: App,
  draft: ReceiptDraft,
  savePathInput: string,
  items: ReceiptItem[],
  settings: {
    scannerTxnIdPrefix: string;
    scannerItemIdPrefix: string;
    scannerIdUseSeparator: boolean;
    scannerIdSeparator: string;
    scannerIdSuffixType: "4numbers" | "4letters" | "4mixed";
  }
): Promise<void> {
  let dateStr = draft.date || new Date().toISOString().substring(0, 10);
  let timeStr = draft.time || "";

  if (dateStr.includes(" ")) {
    const parts = dateStr.split(" ");
    dateStr = parts[0];
    if (!timeStr) {
      timeStr = parts[1] || "";
    }
  }

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(0, 7); // YYYY-MM

  // Resolve parent path from the savePathInput
  const resolvedSavePath = savePathInput.replace(/YYYY/g, year);
  let parentPath = "";
  const lastSlash = resolvedSavePath.lastIndexOf("/");
  if (lastSlash !== -1) {
    parentPath = resolvedSavePath.substring(0, lastSlash);
  }

  // 1. Promote images from draft/ to [parentPath]/transaction/assets/original/ and redacted/
  const promotedOriginalPaths: string[] = [];
  const promotedRedactedPaths: string[] = [];
  const originalAssetsDir = parentPath ? `${parentPath}/transaction/assets/original` : "transaction/assets/original";
  const redactedAssetsDir = parentPath ? `${parentPath}/transaction/assets/redacted` : "transaction/assets/redacted";

  // Ensure directories exist
  await ensureDirectoryExists(app, originalAssetsDir);
  await ensureDirectoryExists(app, redactedAssetsDir);

  // Generate prefix for files: date_time_merchant
  const cleanDate = (dateStr || "").replace(/[^0-9-]/g, "");
  const cleanTime = (timeStr || "").replace(/:/g, "-").replace(/[^0-9-]/g, "");
  const cleanMerchant = sanitizeFilename(draft.merchant || "").replace(/\s+/g, "_");
  const filePrefix = [cleanDate, cleanTime, cleanMerchant].filter(Boolean).join("_") + "_";

  for (const srcPath of draft.imagePaths) {
    // 1.a Promote original image
    if (srcPath.startsWith("draft/")) {
      const filename = srcPath.substring(srcPath.lastIndexOf("/") + 1);
      const baseFilename = filename.replace(/^draft_\d+_/, "").replace(/^draft_/, "");
      const destFilename = `${filePrefix}${baseFilename}`;
      const destOriginalPath = `${originalAssetsDir}/${destFilename}`;
      try {
        if (await app.vault.adapter.exists(srcPath)) {
          const imgData = await app.vault.adapter.readBinary(srcPath);
          await app.vault.adapter.writeBinary(destOriginalPath, imgData);
          await app.vault.adapter.remove(srcPath);
          promotedOriginalPaths.push(destOriginalPath);
        } else {
          console.warn(`Source draft original image not found: ${srcPath}`);
          promotedOriginalPaths.push(srcPath);
        }
      } catch (err) {
        console.error(`Failed to promote original image ${srcPath} to ${destOriginalPath}`, err);
        promotedOriginalPaths.push(srcPath);
      }
    } else {
      promotedOriginalPaths.push(srcPath);
    }

    // 1.b Promote redacted image
    const redactedSrcPath = draft.redactedPaths?.[srcPath];
    if (redactedSrcPath) {
      if (redactedSrcPath.startsWith("draft/")) {
        const filename = redactedSrcPath.substring(redactedSrcPath.lastIndexOf("/") + 1);
        const baseFilename = filename.replace(/^draft_\d+_/, "").replace(/^draft_/, "");
        const destFilename = `${filePrefix}${baseFilename}`;
        const destRedactedPath = `${redactedAssetsDir}/${destFilename}`;
        try {
          if (await app.vault.adapter.exists(redactedSrcPath)) {
            const imgData = await app.vault.adapter.readBinary(redactedSrcPath);
            await app.vault.adapter.writeBinary(destRedactedPath, imgData);
            await app.vault.adapter.remove(redactedSrcPath);
            promotedRedactedPaths.push(destRedactedPath);
          } else {
            console.warn(`Source draft redacted image not found: ${redactedSrcPath}`);
            promotedRedactedPaths.push(redactedSrcPath);
          }
        } catch (err) {
          console.error(`Failed to promote redacted image ${redactedSrcPath} to ${destRedactedPath}`, err);
          promotedRedactedPaths.push(redactedSrcPath);
        }
      } else {
        promotedRedactedPaths.push(redactedSrcPath);
      }
    } else {
      promotedRedactedPaths.push("");
    }
  }

  const grandTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  // 2. Append to items_YYYY.csv (acting as the sole ledger file for both transactions and items)
  const itemsCSVPath = parentPath ? `${parentPath}/items_${year}.csv` : `items_${year}.csv`;
  let itemsCSVExists = await app.vault.adapter.exists(itemsCSVPath);
  
  let existingRows: any[] = [];
  let headers: string[] = [];

  const defaultHeaders = [
    "id",
    "txn_id",
    "date",
    "time",
    "merchant",
    "item_name",
    "qty",
    "price_idr",
    "price_usd",
    "price_myr",
    "category",
    "original_image_path",
    "redacted_image_path"
  ];

  if (itemsCSVExists) {
    try {
      const fileContent = await app.vault.adapter.read(itemsCSVPath);
      const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
      existingRows = parsed.data as any[];
      headers = parsed.meta.fields || [];
    } catch (e) {
      console.error("Failed to parse existing items CSV to scan IDs", e);
    }
  }

  // If headers list is empty, use default headers
  if (headers.length === 0) {
    headers = [...defaultHeaders];
  } else {
    // Ensure all default headers exist in headers
    for (const defHeader of defaultHeaders) {
      if (!headers.includes(defHeader)) {
        headers.push(defHeader);
      }
    }
  }

  const existingItemIds = existingRows.map(r => r.id).filter(Boolean);
  const existingTxnIds = existingRows.map(r => r.txn_id).filter(Boolean);

  // Generate IDs
  const separator = settings.scannerIdUseSeparator ? settings.scannerIdSeparator : "";
  
  const nextTxnIndex = getNextIdIndex(existingTxnIds, settings.scannerIdSuffixType);
  const txnId = settings.scannerTxnIdPrefix + separator + getSuffixForIndex(nextTxnIndex, settings.scannerIdSuffixType);
  
  let nextItemIndex = getNextIdIndex(existingItemIds, settings.scannerIdSuffixType);

  const originalImagePathMerged = promotedOriginalPaths.filter(Boolean).join(";");
  const redactedImagePathMerged = promotedRedactedPaths.filter(Boolean).join(";");

  const newRows: any[] = [];
  for (const item of items) {
    const itemId = settings.scannerItemIdPrefix + separator + getSuffixForIndex(nextItemIndex++, settings.scannerIdSuffixType);

    const newRowObj: Record<string, any> = {};
    for (const h of headers) {
      newRowObj[h] = "";
    }

    newRowObj["id"] = itemId;
    newRowObj["txn_id"] = txnId;
    newRowObj["date"] = dateStr;
    newRowObj["time"] = timeStr;
    newRowObj["merchant"] = draft.merchant;
    newRowObj["item_name"] = item.name;
    newRowObj["qty"] = item.qty.toString();
    newRowObj["price_idr"] = item.price.toString();
    newRowObj["category"] = draft.category;
    newRowObj["original_image_path"] = originalImagePathMerged;
    newRowObj["redacted_image_path"] = redactedImagePathMerged;

    newRows.push(newRowObj);
  }

  const combinedRows = [...existingRows, ...newRows];
  const csvOutput = Papa.unparse({
    fields: headers,
    data: combinedRows
  }, {
    newline: "\n"
  });

  await app.vault.adapter.write(itemsCSVPath, csvOutput);

  // 4. Update merchants.csv
  // Path: [parentPath]/merchants.csv
  // Schema: merchant, total_visits, total_spent, last_visit_date
  const merchantsCSVPath = parentPath ? `${parentPath}/merchants.csv` : "merchants.csv";
  let merchantsCSVExists = await app.vault.adapter.exists(merchantsCSVPath);
  let merchants: Array<Record<string, string>> = [];
  
  if (merchantsCSVExists) {
    const content = await app.vault.adapter.read(merchantsCSVPath);
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    merchants = parsed.data as Array<Record<string, string>>;
  }

  const normalizedMerchant = draft.merchant.trim().toLowerCase();
  let merchantRow = merchants.find(m => (m.merchant || "").trim().toLowerCase() === normalizedMerchant);

  if (merchantRow) {
    const visits = parseInt(merchantRow.total_visits || "0", 10) + 1;
    const spent = parseFloat(merchantRow.total_spent || "0") + grandTotal;
    merchantRow.total_visits = visits.toString();
    merchantRow.total_spent = spent.toString();

    const currentLastDate = merchantRow.last_visit_date || "";
    if (dateStr >= currentLastDate) {
      merchantRow.last_visit_date = dateStr;
    }
  } else {
    merchants.push({
      merchant: draft.merchant.trim(),
      total_visits: "1",
      total_spent: grandTotal.toString(),
      last_visit_date: dateStr
    });
  }

  const merchantsCSVOutput = Papa.unparse(merchants, { header: true, newline: "\n" });
  await app.vault.adapter.write(merchantsCSVPath, merchantsCSVOutput);

  // 5. Update budget.csv
  // Path: [parentPath]/budget.csv
  // Schema: month, category, budgeted_amount, spent_amount, remaining_amount
  const budgetCSVPath = parentPath ? `${parentPath}/budget.csv` : "budget.csv";
  let budgetCSVExists = await app.vault.adapter.exists(budgetCSVPath);
  let budgets: Array<Record<string, string>> = [];

  if (budgetCSVExists) {
    const content = await app.vault.adapter.read(budgetCSVPath);
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    budgets = parsed.data as Array<Record<string, string>>;
  }

  const normalizedCategory = draft.category.trim().toLowerCase();
  let budgetRow = budgets.find(b => 
    (b.month || "").trim() === month && 
    (b.category || "").trim().toLowerCase() === normalizedCategory
  );

  if (budgetRow) {
    const spent = parseFloat(budgetRow.spent_amount || "0") + grandTotal;
    const budgeted = parseFloat(budgetRow.budgeted_amount || "0");
    budgetRow.spent_amount = spent.toString();
    budgetRow.remaining_amount = (budgeted - spent).toString();
  } else {
    budgets.push({
      month: month,
      category: draft.category.trim(),
      budgeted_amount: "0",
      spent_amount: grandTotal.toString(),
      remaining_amount: (-grandTotal).toString()
    });
  }

  const budgetCSVOutput = Papa.unparse(budgets, { header: true, newline: "\n" });
  await app.vault.adapter.write(budgetCSVPath, budgetCSVOutput);

  // 6. Generate notes at Items directory (non-destructive)
  let itemsDir = "";
  if (await app.vault.adapter.exists("wiki/items")) {
    itemsDir = "wiki/items";
  } else if (await app.vault.adapter.exists("wiki/Items")) {
    itemsDir = "wiki/Items";
  } else {
    itemsDir = parentPath ? `${parentPath}/Items` : "Items";
  }
  await ensureDirectoryExists(app, itemsDir);

  for (const item of items) {
    const filename = sanitizeFilename(item.name);
    if (!filename) continue;
    const notePath = `${itemsDir}/${filename}.md`;

    if (!(await app.vault.adapter.exists(notePath))) {
      const noteContent = `# ${item.name}

- Last purchased: ${dateStr}
- Price: IDR ${formatNumber(item.price)}
- Merchant: ${draft.merchant}
`;
      await app.vault.adapter.write(notePath, noteContent);
    }
  }
}
