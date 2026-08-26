import { GridBuffer } from '../core/GridBuffer';
import { AsciiTheme, THEME_PALETTES } from '../types';

export class AsciiExporter {
	/**
	 * Copies raw ASCII text to system clipboard
	 */
	public static async copyToClipboard(text: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (err) {
			console.error('Failed to copy ASCII to clipboard:', err);
			return false;
		}
	}

	/**
	 * Exports a GridBuffer to a vector SVG string
	 */
	public static toSVG(
		buffer: GridBuffer,
		theme: AsciiTheme = 'default',
		fontSize = 16,
		lineHeightRatio = 1.2
	): string {
		const cols = buffer.cols;
		const rows = buffer.rows;
		const charWidth = fontSize * 0.6;
		const charHeight = fontSize * lineHeightRatio;

		const width = Math.ceil(cols * charWidth + 24);
		const height = Math.ceil(rows * charHeight + 24);

		const palette = THEME_PALETTES[theme] || THEME_PALETTES.default;
		const bg = palette.bg.startsWith('var') ? '#1e1e1e' : palette.bg;
		const fg = palette.fg.startsWith('var') ? '#d4d4d4' : palette.fg;

		let textNodes = '';
		for (let r = 0; r < rows; r++) {
			const y = 12 + (r + 0.8) * charHeight;
			let lineText = '';
			for (let c = 0; c < cols; c++) {
				const cell = buffer.getCell(c, r);
				lineText += cell ? cell.char : ' ';
			}
			// Escape XML special characters
			const escaped = lineText
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');

			textNodes += `<text x="12" y="${y.toFixed(1)}" fill="${fg}">${escaped}</text>\n`;
		}

		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}" rx="6" />
  <g font-family="ui-monospace, 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace" font-size="${fontSize}px" xml:space="preserve">
    ${textNodes}
  </g>
</svg>`;
	}

	/**
	 * Exports a GridBuffer to a downloadable PNG data URL
	 */
	public static toPNG(
		buffer: GridBuffer,
		theme: AsciiTheme = 'default',
		scale = 2
	): string {
		const cols = buffer.cols;
		const rows = buffer.rows;
		const fontSize = 16 * scale;
		const charWidth = fontSize * 0.6;
		const charHeight = fontSize * 1.2;

		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(cols * charWidth + 32 * scale);
		canvas.height = Math.ceil(rows * charHeight + 32 * scale);

		const ctx = canvas.getContext('2d');
		if (!ctx) return '';

		const palette = THEME_PALETTES[theme] || THEME_PALETTES.default;
		const bg = palette.bg.startsWith('var') ? '#1e1e1e' : palette.bg;
		const fg = palette.fg.startsWith('var') ? '#d4d4d4' : palette.fg;

		// Draw background
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw Monospace Text
		ctx.font = `${fontSize}px ui-monospace, "Cascadia Code", "Fira Code", Menlo, Consolas, monospace`;
		ctx.fillStyle = fg;
		ctx.textBaseline = 'middle';

		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const cell = buffer.getCell(c, r);
				if (!cell || cell.char === ' ') continue;

				const x = 16 * scale + c * charWidth;
				const y = 16 * scale + (r + 0.5) * charHeight;

				if (cell.bg) {
					ctx.fillStyle = cell.bg;
					ctx.fillRect(x, y - charHeight / 2, charWidth, charHeight);
				}

				ctx.fillStyle = cell.fg || fg;
				ctx.fillText(cell.char, x, y);
			}
		}

		return canvas.toDataURL('image/png');
	}

	/**
	 * Triggers browser download for a data URI or blob
	 */
	public static downloadFile(filename: string, content: string, mimeType: string): void {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
}
