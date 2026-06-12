import { App, TFile, TFolder } from "obsidian";
import Papa from "papaparse";

export interface ReceiptDraft {
  id: string;
  createdAt: number;
  updatedAt: number;
  date: string; // YYYY-MM-DD
  merchant: string;
  category: string;
  rawItemsText: string;
  imagePaths: string[]; // paths relative to vault root, e.g. "draft/assets/xxx.png"
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
  const hasPriceToken = (str: string): boolean => {
    const regex = new RegExp(priceRegexStr);
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
  items: ReceiptItem[]
): Promise<void> {
  const dateStr = draft.date || new Date().toISOString().substring(0, 10);
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(0, 7); // YYYY-MM

  // Resolve save path (replace YYYY with the year)
  const resolvedSavePath = savePathInput.replace(/YYYY/g, year);
  
  // Extract parent directory of the save path
  let parentPath = "";
  const lastSlash = resolvedSavePath.lastIndexOf("/");
  if (lastSlash !== -1) {
    parentPath = resolvedSavePath.substring(0, lastSlash);
  }

  // Ensure the parent directory exists
  if (parentPath) {
    await ensureDirectoryExists(app, parentPath);
  }

  // 1. Promote images from draft/ to [parentPath]/transaction/assets/
  const promotedImagePaths: string[] = [];
  const assetsDir = parentPath ? `${parentPath}/transaction/assets` : "transaction/assets";

  for (const srcPath of draft.imagePaths) {
    if (srcPath.startsWith("draft/")) {
      const filename = srcPath.substring(srcPath.lastIndexOf("/") + 1);
      const destPath = `${assetsDir}/${filename}`;

      // Ensure dest directory exists
      await ensureDirectoryExists(app, assetsDir);

      try {
        if (await app.vault.adapter.exists(srcPath)) {
          const imgData = await app.vault.adapter.readBinary(srcPath);
          await app.vault.adapter.writeBinary(destPath, imgData);
          // Delete from source draft directory
          await app.vault.adapter.remove(srcPath);
          promotedImagePaths.push(destPath);
        } else {
          console.warn(`Source draft image not found: ${srcPath}`);
        }
      } catch (err) {
        console.error(`Failed to promote image ${srcPath} to ${destPath}`, err);
        promotedImagePaths.push(srcPath); // Fallback: keep original reference
      }
    } else {
      promotedImagePaths.push(srcPath);
    }
  }

  const grandTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  // 2. Append to transactions_YYYY.csv
  // Path: resolvedSavePath
  // Schema: date, merchant, category, grand_total, image_paths
  let transCSVExists = await app.vault.adapter.exists(resolvedSavePath);
  let transCSVContent = "";
  if (transCSVExists) {
    transCSVContent = await app.vault.adapter.read(resolvedSavePath);
  } else {
    transCSVContent = "date,merchant,category,grand_total,image_paths\n";
  }

  // Append new row
  const newTransRow = [
    dateStr,
    draft.merchant,
    draft.category,
    grandTotal,
    promotedImagePaths.join(";")
  ].map(escapeCSV).join(",");

  // Ensure file ends with newline
  if (transCSVContent && !transCSVContent.endsWith("\n")) {
    transCSVContent += "\n";
  }
  transCSVContent += newTransRow + "\n";
  await app.vault.adapter.write(resolvedSavePath, transCSVContent);

  // 3. Append to items_YYYY.csv
  // Path: [parentPath]/items_YYYY.csv
  const itemsCSVPath = parentPath ? `${parentPath}/items_${year}.csv` : `items_${year}.csv`;
  let itemsCSVExists = await app.vault.adapter.exists(itemsCSVPath);
  let itemsCSVContent = "";
  if (itemsCSVExists) {
    itemsCSVContent = await app.vault.adapter.read(itemsCSVPath);
  } else {
    itemsCSVContent = "date,merchant,item_name,qty,price_idr,subtotal\n";
  }

  if (itemsCSVContent && !itemsCSVContent.endsWith("\n")) {
    itemsCSVContent += "\n";
  }

  for (const item of items) {
    const itemRow = [
      dateStr,
      draft.merchant,
      item.name,
      item.qty,
      item.price,
      item.subtotal
    ].map(escapeCSV).join(",");
    itemsCSVContent += itemRow + "\n";
  }
  await app.vault.adapter.write(itemsCSVPath, itemsCSVContent);

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
