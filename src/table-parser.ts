export interface TableRow {
	[header: string]: string;
}

export interface ParsedTable {
	headers: string[];
	rows: TableRow[];
}

/** Strip markdown inline formatting and return plain text. */
function stripFormatting(text: string): string {
	return text
		.replace(/\*\*\*(.+?)\*\*\*/g, '$1')   // bold+italic ***x***
		.replace(/___(.+?)___/g, '$1')
		.replace(/\*\*(.+?)\*\*/g, '$1')        // bold **x**
		.replace(/__(.+?)__/g, '$1')
		.replace(/\*(.+?)\*/g, '$1')             // italic *x*
		.replace(/_(.+?)_/g, '$1')
		.replace(/~~(.+?)~~/g, '$1')             // strikethrough ~~x~~
		.replace(/==(.+?)==/g, '$1')             // highlight ==x==
		.replace(/`+([^`]+)`+/g, '$1')           // inline code `x` / ``x``
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links [text](url)
		.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1') // wikilinks [[x]] / [[x|alias]]
		.trim();
}

function splitCells(line: string): string[] {
	return line
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((c) => stripFormatting(c));
}

export function normalizeKey(header: string): string {
	const trimmed = header.trim();
	if (trimmed === '#') return 'number';
	return trimmed
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
}

export function parseMarkdownTable(raw: string): ParsedTable | null {
	const lines = raw
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length < 3) return null;

	const [headerLine, separatorLine, ...dataLines] = lines;

	if (!headerLine || !separatorLine) return null;
	if (!/^\|[-|:\s]+\|?\s*$/.test(separatorLine)) return null;

	const headers = splitCells(headerLine);
	if (headers.length === 0) return null;

	const rows: TableRow[] = [];
	for (const line of dataLines) {
		if (!line.startsWith('|')) continue;
		const cells = splitCells(line);
		const row: TableRow = {};
		headers.forEach((h, i) => {
			row[h] = cells[i] ?? '';
		});
		rows.push(row);
	}

	return { headers, rows };
}

/** Return the raw text of the markdown table that contains the given line number. */
export function extractTableAtCursor(content: string, cursorLine: number): string | null {
	const lines = content.split('\n');

	if (cursorLine < 0 || cursorLine >= lines.length) return null;
	if (!lines[cursorLine]?.trim().startsWith('|')) return null;

	let start = cursorLine;
	while (start > 0 && lines[start - 1]?.trim().startsWith('|')) start--;

	let end = cursorLine;
	while (end < lines.length - 1 && lines[end + 1]?.trim().startsWith('|')) end++;

	if (end - start < 2) return null; // need header + separator + ≥1 data row
	return lines.slice(start, end + 1).join('\n');
}
