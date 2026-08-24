import { Cell, BoxStyle, LineStyle, ArrowStyle, SelectionRect, Point } from '../types';

export class GridBuffer {
	public cols: number;
	public rows: number;
	public cells: Cell[][];

	constructor(cols: number, rows: number, fillChar = ' ') {
		this.cols = Math.max(1, cols);
		this.rows = Math.max(1, rows);
		this.cells = this.createEmptyCells(this.cols, this.rows, fillChar);
	}

	private createEmptyCells(cols: number, rows: number, fillChar = ' '): Cell[][] {
		const grid: Cell[][] = [];
		for (let r = 0; r < rows; r++) {
			const row: Cell[] = [];
			for (let c = 0; c < cols; c++) {
				row.push({ char: fillChar });
			}
			grid.push(row);
		}
		return grid;
	}

	public inBounds(x: number, y: number): boolean {
		return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
	}

	public getCell(x: number, y: number): Cell | null {
		if (!this.inBounds(x, y)) return null;
		return this.cells[y][x];
	}

	public setCell(x: number, y: number, cell: Partial<Cell>): void {
		if (!this.inBounds(x, y)) return;
		const current = this.cells[y][x];
		this.cells[y][x] = {
			char: cell.char !== undefined ? cell.char : current.char,
			fg: cell.fg !== undefined ? cell.fg : current.fg,
			bg: cell.bg !== undefined ? cell.bg : current.bg,
			bold: cell.bold !== undefined ? cell.bold : current.bold
		};
	}

	public clear(fillChar = ' '): void {
		for (let r = 0; r < this.rows; r++) {
			for (let c = 0; c < this.cols; c++) {
				this.cells[r][c] = { char: fillChar };
			}
		}
	}

	public resize(newCols: number, newRows: number, fillChar = ' '): void {
		const targetCols = Math.max(1, newCols);
		const targetRows = Math.max(1, newRows);
		const newGrid: Cell[][] = [];

		for (let r = 0; r < targetRows; r++) {
			const row: Cell[] = [];
			for (let c = 0; c < targetCols; c++) {
				if (r < this.rows && c < this.cols) {
					row.push({ ...this.cells[r][c] });
				} else {
					row.push({ char: fillChar });
				}
			}
			newGrid.push(row);
		}

		this.cols = targetCols;
		this.rows = targetRows;
		this.cells = newGrid;
	}

	public clone(): GridBuffer {
		const copy = new GridBuffer(this.cols, this.rows);
		for (let r = 0; r < this.rows; r++) {
			for (let c = 0; c < this.cols; c++) {
				copy.cells[r][c] = { ...this.cells[r][c] };
			}
		}
		return copy;
	}

	// =========================================================================
	// Drawing Algorithms
	// =========================================================================

	/**
	 * Bresenham's Line Algorithm with smooth point rendering
	 */
	public drawLine(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		charOrStyle: string | LineStyle,
		fg?: string,
		bg?: string
	): void {
		const points = this.getBresenhamPoints(x0, y0, x1, y1);
		const isAutoChar = ['single', 'double', 'ascii', 'dashed'].includes(charOrStyle);

		for (let i = 0; i < points.length; i++) {
			const pt = points[i];
			let charToUse = typeof charOrStyle === 'string' && !isAutoChar ? charOrStyle : '─';

			if (isAutoChar) {
				const dx = Math.abs(x1 - x0);
				const dy = Math.abs(y1 - y0);

				if (charOrStyle === 'single') {
					charToUse = dy > dx * 1.5 ? '│' : (dx > dy * 1.5 ? '─' : (x1 > x0 === y1 > y0 ? '\\' : '/'));
				} else if (charOrStyle === 'double') {
					charToUse = dy > dx * 1.5 ? '║' : (dx > dy * 1.5 ? '═' : (x1 > x0 === y1 > y0 ? '\\' : '/'));
				} else if (charOrStyle === 'ascii') {
					charToUse = dy > dx * 1.5 ? '|' : (dx > dy * 1.5 ? '-' : (x1 > x0 === y1 > y0 ? '\\' : '/'));
				} else if (charOrStyle === 'dashed') {
					charToUse = dy > dx * 1.5 ? '┊' : '┈';
				}
			}

			this.setCell(pt.x, pt.y, { char: charToUse, fg, bg });
		}
	}

	/**
	 * Arrow drawing tool
	 */
	public drawArrow(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		arrowStyle: ArrowStyle = 'right',
		lineStyle: LineStyle = 'single',
		fg?: string,
		bg?: string
	): void {
		this.drawLine(x0, y0, x1, y1, lineStyle, fg, bg);

		const dx = x1 - x0;
		const dy = y1 - y0;
		const isVertical = Math.abs(dy) > Math.abs(dx);

		// Determine tip character based on direction
		let tipChar = '►';
		if (isVertical) {
			tipChar = dy > 0 ? '▼' : '▲';
		} else {
			tipChar = dx > 0 ? '►' : '◄';
		}

		if (arrowStyle === 'right' || arrowStyle === 'both') {
			this.setCell(x1, y1, { char: tipChar, fg, bg });
		}

		if (arrowStyle === 'left' || arrowStyle === 'both') {
			let tailChar = isVertical ? (dy > 0 ? '▲' : '▼') : (dx > 0 ? '◄' : '►');
			this.setCell(x0, y0, { char: tailChar, fg, bg });
		}
	}

	/**
	 * Box / Rectangle drawing
	 */
	public drawBox(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		style: BoxStyle = 'single',
		fill = false,
		fillChar = ' ',
		fg?: string,
		bg?: string
	): void {
		const minX = Math.min(x0, x1);
		const maxX = Math.max(x0, x1);
		const minY = Math.min(y0, y1);
		const maxY = Math.max(y0, y1);

		let tl = '┌', tr = '┐', bl = '└', br = '┘', h = '─', v = '│';

		if (style === 'double') {
			tl = '╔'; tr = '╗'; bl = '╚'; br = '╝'; h = '═'; v = '║';
		} else if (style === 'ascii') {
			tl = '+'; tr = '+'; bl = '+'; br = '+'; h = '-'; v = '|';
		} else if (style === 'rounded') {
			tl = '╭'; tr = '╮'; bl = '╰'; br = '╯'; h = '─'; v = '│';
		} else if (style === 'solid') {
			tl = '█'; tr = '█'; bl = '█'; br = '█'; h = '█'; v = '█';
		} else if (style === 'dashed') {
			tl = '┌'; tr = '┐'; bl = '└'; br = '┘'; h = '┈'; v = '┊';
		}

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const isTop = y === minY;
				const isBottom = y === maxY;
				const isLeft = x === minX;
				const isRight = x === maxX;

				if (isTop && isLeft) this.setCell(x, y, { char: tl, fg, bg });
				else if (isTop && isRight) this.setCell(x, y, { char: tr, fg, bg });
				else if (isBottom && isLeft) this.setCell(x, y, { char: bl, fg, bg });
				else if (isBottom && isRight) this.setCell(x, y, { char: br, fg, bg });
				else if (isTop || isBottom) this.setCell(x, y, { char: h, fg, bg });
				else if (isLeft || isRight) this.setCell(x, y, { char: v, fg, bg });
				else if (fill) this.setCell(x, y, { char: fillChar, fg, bg });
			}
		}
	}

	/**
	 * Midpoint Circle / Ellipse algorithm
	 */
	public drawCircle(
		xc: number,
		yc: number,
		rx: number,
		ry: number,
		char = 'o',
		fill = false,
		fillChar = ' ',
		fg?: string,
		bg?: string
	): void {
		rx = Math.max(1, Math.round(rx));
		ry = Math.max(1, Math.round(ry));

		const minX = Math.max(0, xc - rx);
		const maxX = Math.min(this.cols - 1, xc + rx);
		const minY = Math.max(0, yc - ry);
		const maxY = Math.min(this.rows - 1, yc + ry);

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const dx = (x - xc) / rx;
				const dy = (y - yc) / ry;
				const dist = dx * dx + dy * dy;

				if (dist <= 1.15 && dist >= 0.7) {
					this.setCell(x, y, { char, fg, bg });
				} else if (fill && dist < 0.7) {
					this.setCell(x, y, { char: fillChar, fg, bg });
				}
			}
		}
	}

	/**
	 * Flood Fill algorithm (4-way)
	 */
	public floodFill(
		startX: number,
		startY: number,
		replacementChar: string,
		fg?: string,
		bg?: string
	): void {
		if (!this.inBounds(startX, startY)) return;

		const targetCell = this.cells[startY][startX];
		const targetChar = targetCell.char;

		if (targetChar === replacementChar && targetCell.fg === fg && targetCell.bg === bg) {
			return;
		}

		const stack: Point[] = [{ x: startX, y: startY }];
		const visited: boolean[][] = Array.from({ length: this.rows }, () =>
			Array.from({ length: this.cols }, () => false)
		);

		while (stack.length > 0) {
			const pt = stack.pop()!;
			const { x, y } = pt;

			if (!this.inBounds(x, y) || visited[y][x]) continue;
			visited[y][x] = true;

			const current = this.cells[y][x];
			if (current.char !== targetChar) continue;

			this.setCell(x, y, { char: replacementChar, fg, bg });

			stack.push({ x: x + 1, y });
			stack.push({ x: x - 1, y });
			stack.push({ x, y: y + 1 });
			stack.push({ x, y: y - 1 });
		}
	}

	/**
	 * Text placement tool
	 */
	public drawText(startX: number, startY: number, text: string, fg?: string, bg?: string): void {
		const lines = text.split('\n');
		for (let l = 0; l < lines.length; l++) {
			const line = lines[l];
			const curY = startY + l;
			if (curY >= this.rows) break;

			for (let c = 0; c < line.length; c++) {
				const curX = startX + c;
				if (curX >= this.cols) break;
				this.setCell(curX, curY, { char: line[c], fg, bg });
			}
		}
	}

	/**
	 * Region copy & paste
	 */
	public copyRegion(rect: SelectionRect): Cell[][] {
		const minX = Math.max(0, Math.min(rect.startX, rect.endX));
		const maxX = Math.min(this.cols - 1, Math.max(rect.startX, rect.endX));
		const minY = Math.max(0, Math.min(rect.startY, rect.endY));
		const maxY = Math.min(this.rows - 1, Math.max(rect.startY, rect.endY));

		const region: Cell[][] = [];
		for (let y = minY; y <= maxY; y++) {
			const row: Cell[] = [];
			for (let x = minX; x <= maxX; x++) {
				row.push({ ...this.cells[y][x] });
			}
			region.push(row);
		}
		return region;
	}

	public pasteRegion(
		region: Cell[][],
		targetX: number,
		targetY: number,
		ignoreWhitespace = false
	): void {
		for (let r = 0; r < region.length; r++) {
			const curY = targetY + r;
			if (curY >= this.rows || curY < 0) continue;

			for (let c = 0; c < region[r].length; c++) {
				const curX = targetX + c;
				if (curX >= this.cols || curX < 0) continue;

				const cell = region[r][c];
				if (ignoreWhitespace && cell.char === ' ') continue;

				this.setCell(curX, curY, cell);
			}
		}
	}

	public deleteRegion(rect: SelectionRect, fillChar = ' '): void {
		const minX = Math.max(0, Math.min(rect.startX, rect.endX));
		const maxX = Math.min(this.cols - 1, Math.max(rect.startX, rect.endX));
		const minY = Math.max(0, Math.min(rect.startY, rect.endY));
		const maxY = Math.min(this.rows - 1, Math.max(rect.startY, rect.endY));

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				this.cells[y][x] = { char: fillChar };
			}
		}
	}

	// =========================================================================
	// Serialization
	// =========================================================================

	public toString(trimTrailingEmptyLines = true): string {
		let lines = this.cells.map(row => {
			// Join characters and trim trailing spaces
			return row.map(cell => cell.char || ' ').join('').replace(/\s+$/, '');
		});

		if (trimTrailingEmptyLines) {
			while (lines.length > 0 && lines[lines.length - 1] === '') {
				lines.pop();
			}
		}

		return lines.join('\n');
	}

	public fromString(text: string, fillChar = ' '): void {
		const lines = text.split(/\r?\n/);
		const contentRows = lines.length;
		const contentCols = Math.max(...lines.map(l => l.length), 0);

		if (contentCols > this.cols || contentRows > this.rows) {
			this.resize(Math.max(this.cols, contentCols), Math.max(this.rows, contentRows), fillChar);
		} else {
			this.clear(fillChar);
		}

		for (let r = 0; r < lines.length; r++) {
			if (r >= this.rows) break;
			const line = lines[r];
			for (let c = 0; c < line.length; c++) {
				if (c >= this.cols) break;
				this.cells[r][c] = { char: line[c] };
			}
		}
	}

	public getBresenhamPoints(x0: number, y0: number, x1: number, y1: number): Point[] {
		const points: Point[] = [];
		x0 = Math.round(x0);
		y0 = Math.round(y0);
		x1 = Math.round(x1);
		y1 = Math.round(y1);

		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;

		let curX = x0;
		let curY = y0;

		while (true) {
			points.push({ x: curX, y: curY });
			if (curX === x1 && curY === y1) break;

			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				curX += sx;
			}
			if (e2 < dx) {
				err += dx;
				curY += sy;
			}
		}

		return points;
	}
}
