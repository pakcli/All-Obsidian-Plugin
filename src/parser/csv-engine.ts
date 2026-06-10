import Papa from "papaparse";

export interface ParseResult {
  data: string[][];
  headers: string[];
  hasHeader: boolean;
}

function generateColumnLabels(count: number): string[] {
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    let label = "";
    let n = i;
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    labels.push(label);
  }
  return labels;
}

/**
 * Heuristic: first row is likely a header if it looks distinct from the data rows.
 * - All first-row values are non-numeric while most data rows contain numbers
 * - First row has no duplicate values (headers are typically unique)
 * - First row values look like labels (no pure numbers)
 */
function detectHasHeader(rows: string[][]): boolean {
  if (rows.length < 2) return true; // only one row, treat as header by default

  const firstRow = rows[0];

  // Check if first row has duplicate values — headers rarely do
  const uniqueFirst = new Set(firstRow.map((v) => v.trim().toLowerCase()));
  if (uniqueFirst.size < firstRow.length) return false;

  // Check if first row is all non-numeric while data rows have numbers
  const isNumeric = (v: string) => v.trim() !== "" && !isNaN(Number(v.trim()));
  const firstRowNumCount = firstRow.filter(isNumeric).length;

  // Sample up to 10 data rows
  const sampleRows = rows.slice(1, 11);
  const dataNumCounts = sampleRows.map(
    (row) => row.filter(isNumeric).length,
  );
  const avgDataNums =
    dataNumCounts.reduce((a, b) => a + b, 0) / dataNumCounts.length;

  // If data rows have numbers but first row doesn't, likely a header
  if (firstRowNumCount === 0 && avgDataNums > 0) return true;

  // If first row has fewer numbers than data rows on average, likely a header
  if (firstRowNumCount < avgDataNums * 0.5) return true;

  // If first row pattern matches data rows, probably not a header
  if (firstRowNumCount > 0 && Math.abs(firstRowNumCount - avgDataNums) < 1) return false;

  // Default: treat first row as header
  return true;
}

/**
 * Pre-trim trailing delimiters from each line of CSV text.
 * This prevents PapaParse from creating millions of empty cell objects
 * for Excel exports that pad rows with trailing delimiters.
 *
 * Handles the common case where delimiter is a single character (comma, tab, etc.).
 * Respects quoted fields — only trims unquoted trailing delimiters.
 */
function trimTrailingDelimiters(text: string, delimiter: string): string {
  if (delimiter.length !== 1) return text;
  const delCode = delimiter.charCodeAt(0);

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Fast path: if line doesn't end with delimiter (or \r + delimiter), skip
    let endIdx = line.length;
    // Strip trailing \r for line-end check
    if (endIdx > 0 && line.charCodeAt(endIdx - 1) === 13 /* \r */) {
      endIdx--;
    }
    if (endIdx === 0 || line.charCodeAt(endIdx - 1) !== delCode) continue;

    // Count fields by tracking quote state to find where real data ends
    let inQuote = false;
    let lastNonEmptyEnd = 0; // end position of last non-empty field
    let fieldStart = 0;
    let fieldHasContent = false;

    for (let j = 0; j <= endIdx; j++) {
      const ch = j < endIdx ? line.charCodeAt(j) : -1;

      if (inQuote) {
        if (ch === 34 /* " */) {
          // Check for escaped quote ""
          if (j + 1 < endIdx && line.charCodeAt(j + 1) === 34) {
            j++; // skip escaped quote
            fieldHasContent = true;
          } else {
            inQuote = false;
          }
        } else {
          fieldHasContent = true;
        }
      } else if (ch === 34 /* " */ && !fieldHasContent) {
        inQuote = true;
      } else if (ch === delCode || ch === -1) {
        // End of field
        if (fieldHasContent) {
          lastNonEmptyEnd = j;
        } else {
          // Check if the field between fieldStart and j is non-empty
          for (let k = fieldStart; k < j; k++) {
            const fch = line.charCodeAt(k);
            if (fch !== 32 && fch !== 9 && fch !== 13) { // not space/tab/cr
              fieldHasContent = true;
              lastNonEmptyEnd = j;
              break;
            }
          }
        }
        fieldStart = j + 1;
        fieldHasContent = false;
      } else {
        fieldHasContent = true;
      }
    }

    if (lastNonEmptyEnd < endIdx) {
      // Preserve trailing \r if present
      const hasCarriageReturn = line.length > endIdx;
      lines[i] = line.substring(0, lastNonEmptyEnd) + (hasCarriageReturn ? "\r" : "");
    }
  }

  return lines.join("\n");
}

/**
 * Find the last column index that contains any non-empty value across all rows
 * (including the header row). Safety net after pre-trim — normally a no-op.
 */
function findLastNonEmptyColumn(allRows: string[][]): number {
  let lastNonEmpty = 0;
  for (const row of allRows) {
    for (let i = row.length - 1; i > lastNonEmpty; i--) {
      if (row[i] != null && row[i].trim() !== "") {
        lastNonEmpty = i;
        break;
      }
    }
  }
  return lastNonEmpty;
}

export function parseCSV(
  text: string,
  delimiter: string,
  hasHeader?: boolean,
): ParseResult {
  // Pre-trim trailing delimiters to avoid parsing millions of empty cells
  const trimmedText = trimTrailingDelimiters(text, delimiter);

  const result = Papa.parse<string[]>(trimmedText, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
  });

  const rawData = result.data;
  if (rawData.length === 0) {
    return { headers: [], data: [], hasHeader: true };
  }

  // Post-parse safety net: trim any remaining trailing empty columns
  const lastCol = findLastNonEmptyColumn(rawData);
  const effectiveColCount = lastCol + 1;

  const detectedHasHeader = hasHeader ?? detectHasHeader(rawData);

  if (detectedHasHeader) {
    const headers = rawData[0].slice(0, effectiveColCount);
    const rows = rawData.slice(1);
    const colCount = headers.length;
    const normalized = rows.map((row) => {
      if (row.length < colCount) {
        return [...row, ...new Array(colCount - row.length).fill("")];
      }
      return row.slice(0, colCount);
    });
    return { headers, data: normalized, hasHeader: true };
  } else {
    const rawColCount = Math.max(...rawData.map((r) => r.length));
    const colCount = Math.min(rawColCount, effectiveColCount);
    const headers = generateColumnLabels(colCount);
    const normalized = rawData.map((row) => {
      if (row.length < colCount) {
        return [...row, ...new Array(colCount - row.length).fill("")];
      }
      return row.slice(0, colCount);
    });
    return { headers, data: normalized, hasHeader: false };
  }
}

export function serializeCSV(
  headers: string[],
  data: string[][],
  delimiter: string,
  hasHeader: boolean = true,
): string {
  const allRows = hasHeader ? [headers, ...data] : data;
  return Papa.unparse(allRows, {
    delimiter,
    newline: "\n",
  });
}
