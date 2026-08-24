import { Cell } from '../types';

export interface TransformState {
	translateX: number;
	translateY: number;
	scaleX: number;
	scaleY: number;
	rotationDeg: number;
	anchorX: number; // relative [0, 1] inside the bounding box
	anchorY: number;
}

export class TransformEngine {
	/**
	 * Flips a 2D character matrix horizontally and substitutes mirrored Unicode/ASCII characters
	 */
	public static flipHorizontal(region: Cell[][]): Cell[][] {
		const mirrorMap: Record<string, string> = {
			'┌': '┐', '┐': '┌', '└': '┘', '┘': '└',
			'╔': '╗', '╗': '╔', '╚': '╝', '╝': '╚',
			'├': '┤', '┤': '├', '╠': '╣', '╣': '╠',
			'╭': '╮', '╮': '╭', '╰': '╯', '╯': '╰',
			'┏': '┓', '┓': '┏', '┗': '┛', '┛': '┗',
			'<': '>', '>': '<', '[': ']', ']': '[',
			'(': ')', ')': '(', '{': '}', '}': '{',
			'/': '\\', '\\': '/', '◄': '►', '►': '◄',
			'←': '→', '→': '←', '◀': '▶', '▶': '◀',
			'▖': '▗', '▗': '▖', '▘': '▝', '▝': '▘',
			'▙': '▟', '▟': '▙', '▛': '▜', '▜': '▛',
			'▌': '▐', '▐': '▌'
		};

		return region.map(row => {
			const newRow: Cell[] = [];
			for (let i = row.length - 1; i >= 0; i--) {
				const cell = row[i];
				const mirroredChar = mirrorMap[cell.char] || cell.char;
				newRow.push({ ...cell, char: mirroredChar });
			}
			return newRow;
		});
	}

	/**
	 * Flips a 2D character matrix vertically and substitutes vertically mirrored characters
	 */
	public static flipVertical(region: Cell[][]): Cell[][] {
		const mirrorMap: Record<string, string> = {
			'┌': '└', '└': '┌', '┐': '┘', '┘': '┐',
			'╔': '╚', '╚': '╔', '╗': '╝', '╝': '╗',
			'┬': '┴', '┴': '┬', '╦': '╩', '╩': '╦',
			'╭': '╰', '╰': '╭', '╮': '╯', '╯': '╮',
			'┏': '┗', '┗': '┏', '┓': '┛', '┛': '┓',
			'▲': '▼', '▼': '▲', '↑': '↓', '↓': '↑',
			'▀': '▄', '▄': '▀',
			'▘': '▖', '▖': '▘', '▝': '▗', '▗': '▝',
			'▛': '▙', '▙': '▛', '▜': '▟', '▟': '▜',
			'/': '\\', '\\': '/'
		};

		const newGrid: Cell[][] = [];
		for (let r = region.length - 1; r >= 0; r--) {
			const row = region[r].map(cell => {
				const mirroredChar = mirrorMap[cell.char] || cell.char;
				return { ...cell, char: mirroredChar };
			});
			newGrid.push(row);
		}
		return newGrid;
	}

	/**
	 * Rotates a 2D character matrix 90 degrees clockwise
	 */
	public static rotate90(region: Cell[][]): Cell[][] {
		if (region.length === 0) return [];
		const rows = region.length;
		const cols = region[0].length;

		const rotateMap: Record<string, string> = {
			'─': '│', '│': '─', '═': '║', '║': '═',
			'━': '┃', '┃': '━', '-': '|', '|': '-',
			'┌': '┐', '┐': '┘', '┘': '└', '└': '┌',
			'╔': '╗', '╗': '╝', '╝': '╚', '╚': '╔',
			'╭': '╮', '╮': '╯', '╯': '╰', '╰': '╭',
			'▲': '►', '►': '▼', '▼': '◄', '◄': '▲',
			'↑': '→', '→': '↓', '↓': '←', '←': '↑',
			'▀': '▌', '▌': '▄', '▄': '▐', '▐': '▀'
		};

		const result: Cell[][] = [];
		for (let c = 0; c < cols; c++) {
			const newRow: Cell[] = [];
			for (let r = rows - 1; r >= 0; r--) {
				const cell = region[r][c];
				const rotatedChar = rotateMap[cell.char] || cell.char;
				newRow.push({ ...cell, char: rotatedChar });
			}
			result.push(newRow);
		}
		return result;
	}

	/**
	 * Resamples and transforms a region with arbitrary scale and rotation
	 */
	public static applyTransform(
		sourceRegion: Cell[][],
		transform: TransformState
	): { transformed: Cell[][]; offsetCols: number; offsetRows: number } {
		const srcRows = sourceRegion.length;
		if (srcRows === 0) return { transformed: [], offsetCols: 0, offsetRows: 0 };
		const srcCols = sourceRegion[0].length;
		if (srcCols === 0) return { transformed: [], offsetCols: 0, offsetRows: 0 };

		const rad = (transform.rotationDeg * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);

		const sx = Math.abs(transform.scaleX) || 1;
		const sy = Math.abs(transform.scaleY) || 1;

		// Calculate transformed bounding box
		const dstCols = Math.max(1, Math.round(srcCols * sx * Math.abs(cos) + srcRows * sy * Math.abs(sin)));
		const dstRows = Math.max(1, Math.round(srcCols * sx * Math.abs(sin) + srcRows * sy * Math.abs(cos)));

		const result: Cell[][] = [];
		for (let r = 0; r < dstRows; r++) {
			const row: Cell[] = [];
			for (let c = 0; c < dstCols; c++) {
				row.push({ char: ' ' });
			}
			result.push(row);
		}

		const srcCenterCol = srcCols * transform.anchorX;
		const srcCenterRow = srcRows * transform.anchorY;
		const dstCenterCol = dstCols * transform.anchorX;
		const dstCenterRow = dstRows * transform.anchorY;

		// Inverse mapping
		for (let dy = 0; dy < dstRows; dy++) {
			for (let dx = 0; dx < dstCols; dx++) {
				const xOffset = (dx - dstCenterCol) / sx;
				const yOffset = (dy - dstCenterRow) / sy;

				const srcX = Math.round(xOffset * cos + yOffset * sin + srcCenterCol);
				const srcY = Math.round(-xOffset * sin + yOffset * cos + srcCenterRow);

				if (srcX >= 0 && srcX < srcCols && srcY >= 0 && srcY < srcRows) {
					const cell = sourceRegion[srcY][srcX];
					if (cell && cell.char !== ' ') {
						result[dy][dx] = { ...cell };
					}
				}
			}
		}

		return {
			transformed: result,
			offsetCols: Math.round(transform.translateX),
			offsetRows: Math.round(transform.translateY)
		};
	}
}
