import { App, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, TFile } from 'obsidian';
import { AsciiTool, AsciiTheme, THEME_PALETTES, BoxStyle, LineStyle } from '../types';
import { GridBuffer } from '../core/GridBuffer';
import { AsciiSerializer } from '../utils/serializer';
import { AsciiExporter } from '../utils/exporter';
import { AsciiDrawModal } from './AsciiDrawModal';

export class AsciiCodeblockRenderer extends MarkdownRenderChild {
	private app: App;
	private source: string;
	private lang: string;
	private ctx: MarkdownPostProcessorContext;

	// Buffer & State
	private buffer: GridBuffer;
	private theme: AsciiTheme = 'default';
	private inlineMode: 'draw' | 'lock' = 'draw';
	private activeTool: AsciiTool = 'pencil';
	private activeChar = '█';
	private boxStyle: BoxStyle = 'single';
	private lineStyle: LineStyle = 'single';

	// Drawing tracking
	private isDrawing = false;
	private lastPointerPos: { x: number; y: number } | null = null;
	private dragStartPos: { x: number; y: number } | null = null;
	private saveTimeout: number | null = null;

	// DOM Elements
	private containerCard!: HTMLElement;
	private gridSurfaceEl!: HTMLElement;
	private colsInputEl!: HTMLInputElement;
	private rowsInputEl!: HTMLInputElement;
	private presetSelectEl!: HTMLSelectElement;

	constructor(
		containerEl: HTMLElement,
		source: string,
		lang: string,
		ctx: MarkdownPostProcessorContext,
		app: App
	) {
		super(containerEl);
		this.app = app;
		this.source = source;
		this.lang = lang;
		this.ctx = ctx;

		const parsed = AsciiSerializer.parse(source);
		this.theme = parsed.theme;
		this.buffer = new GridBuffer(parsed.cols, parsed.rows);
		if (parsed.frames && parsed.frames.length > 0) {
			this.buffer.fromString(parsed.frames[0]);
		}
	}

	onload(): void {
		this.buildInlineRenderer();
	}

	onunload(): void {
		if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
		this.containerEl.empty();
	}

	private buildInlineRenderer(): void {
		this.containerEl.empty();

		const palette = THEME_PALETTES[this.theme] || THEME_PALETTES.default;

		this.containerCard = this.containerEl.createDiv({ cls: 'asciidraw-inline-card' });
		this.containerCard.style.setProperty('--card-bg', palette.bg);
		this.containerCard.style.setProperty('--card-fg', palette.fg);
		this.containerCard.style.setProperty('--card-border', palette.border);
		this.containerCard.style.setProperty('--card-accent', palette.accent);

		// 1. Unified Header Toolbar (Contains all 6 controls)
		const header = this.containerCard.createDiv({ cls: 'asciidraw-inline-header' });
		this.buildHeaderToolbar(header);

		// 2. Main Canvas Body
		const bodyWrapper = this.containerCard.createDiv({ cls: 'asciidraw-inline-body' });

		// Draw Surface (Interactive cell grid & draggable asset in Lock mode)
		this.gridSurfaceEl = bodyWrapper.createDiv({ cls: 'asciidraw-inline-grid' });
		this.gridSurfaceEl.style.touchAction = 'none';

		this.gridSurfaceEl.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
		window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
		window.addEventListener('pointerup', (e) => this.handlePointerUp(e));

		// Draggable Asset support on Lock mode
		this.gridSurfaceEl.addEventListener('dragstart', (e: DragEvent) => this.handleDragStart(e));

		this.updateLockState();
		this.renderGrid();
	}

	private buildHeaderToolbar(parent: HTMLElement): void {
		const leftGroup = parent.createDiv({ cls: 'asciidraw-inline-group' });

		// 1. Dropdown / Switcher: Draw | Lock
		const modeSelector = leftGroup.createEl('select', {
			cls: 'asciidraw-inline-select asciidraw-mode-select',
			title: 'Switch between Draw Mode and Lock (Draggable Asset) Mode'
		});
		const optDraw = modeSelector.createEl('option', { text: '✏️ Draw', value: 'draw' });
		const optLock = modeSelector.createEl('option', { text: '🔒 Lock (Drag Asset)', value: 'lock' });
		optDraw.selected = this.inlineMode === 'draw';
		optLock.selected = this.inlineMode === 'lock';

		modeSelector.onchange = () => {
			this.inlineMode = modeSelector.value as 'draw' | 'lock';
			this.updateLockState();
			if (this.inlineMode === 'lock') {
				new Notice('🔒 Canvas locked: Drag the canvas to copy or drop SVG asset.');
			}
		};

		// 2. Draw Tool Box Dropdown: Box draw | Pencil | Fill | Erase | Circle draw | Line draw
		const toolSelector = leftGroup.createEl('select', {
			cls: 'asciidraw-inline-select',
			title: 'Select Drawing Tool'
		});
		const tools: { id: AsciiTool; label: string }[] = [
			{ id: 'box', label: '🔲 Box draw' },
			{ id: 'pencil', label: '✏️ Pencil' },
			{ id: 'fill', label: '🪣 Fill' },
			{ id: 'eraser', label: '🧹 Erase' },
			{ id: 'circle', label: '⭕ Circle draw' },
			{ id: 'line', label: '📏 Line draw' }
		];
		tools.forEach(t => {
			const opt = toolSelector.createEl('option', { text: t.label, value: t.id });
			if (t.id === this.activeTool) opt.selected = true;
		});
		toolSelector.onchange = () => {
			this.activeTool = toolSelector.value as AsciiTool;
		};

		// Quick Character Dropdown
		const charSelector = leftGroup.createEl('select', {
			cls: 'asciidraw-inline-select asciidraw-char-select',
			title: 'Drawing Character / Glyph'
		});
		const quickChars = ['█', '▓', '▒', '░', '┌', '─', '│', '┼', '#', '@', '*', '+', '=', 'o'];
		quickChars.forEach(ch => {
			const opt = charSelector.createEl('option', { text: ch, value: ch });
			if (ch === this.activeChar) opt.selected = true;
		});
		charSelector.onchange = () => {
			this.activeChar = charSelector.value;
		};

		// 6. Dropdown Preset with Custom Size Height / Width
		const sizeGroup = leftGroup.createDiv({ cls: 'asciidraw-inline-size-group' });
		this.presetSelectEl = sizeGroup.createEl('select', {
			cls: 'asciidraw-inline-select asciidraw-size-preset-select',
			title: 'Canvas Size Preset'
		});

		const presets = [
			{ label: '60 × 20 (Default)', cols: 60, rows: 20 },
			{ label: '40 × 15 (Small)', cols: 40, rows: 15 },
			{ label: '80 × 24 (Medium)', cols: 80, rows: 24 },
			{ label: '100 × 30 (Large)', cols: 100, rows: 30 },
			{ label: '120 × 40 (Wide)', cols: 120, rows: 40 },
			{ label: 'Custom Size', cols: 0, rows: 0 }
		];

		presets.forEach(p => {
			const opt = this.presetSelectEl.createEl('option', { text: p.label, value: `${p.cols}x${p.rows}` });
			if (p.cols === this.buffer.cols && p.rows === this.buffer.rows) {
				opt.selected = true;
			}
		});

		this.colsInputEl = sizeGroup.createEl('input', {
			type: 'number',
			cls: 'asciidraw-size-input',
			value: String(this.buffer.cols),
			attr: { min: '5', max: '200', title: 'Width (Columns)' }
		});

		sizeGroup.createSpan({ cls: 'asciidraw-size-x', text: '×' });

		this.rowsInputEl = sizeGroup.createEl('input', {
			type: 'number',
			cls: 'asciidraw-size-input',
			value: String(this.buffer.rows),
			attr: { min: '3', max: '100', title: 'Height (Rows)' }
		});

		const applyDimensions = () => {
			const w = Math.max(5, parseInt(this.colsInputEl.value, 10) || 60);
			const h = Math.max(3, parseInt(this.rowsInputEl.value, 10) || 20);
			this.buffer.resize(w, h);
			this.renderGrid();
			this.debouncedSave();
		};

		this.colsInputEl.onchange = applyDimensions;
		this.rowsInputEl.onchange = applyDimensions;

		this.presetSelectEl.onchange = () => {
			const val = this.presetSelectEl.value;
			if (val && val !== '0x0') {
				const [w, h] = val.split('x').map(n => parseInt(n, 10));
				this.colsInputEl.value = String(w);
				this.rowsInputEl.value = String(h);
				this.buffer.resize(w, h);
				this.renderGrid();
				this.debouncedSave();
			}
		};

		// Right Actions: Clear, Copy, Fullscreen
		const rightGroup = parent.createDiv({ cls: 'asciidraw-inline-group' });

		// 3. Clear with confirmation
		const btnClear = rightGroup.createEl('button', {
			cls: 'asciidraw-card-btn asciidraw-card-btn-danger',
			text: '🗑️ Clear',
			title: 'Clear entire canvas (requires confirmation)'
		});
		btnClear.onclick = () => {
			const confirmed = window.confirm('Are you sure you want to clear this drawing canvas?');
			if (confirmed) {
				this.buffer.clear(' ');
				this.renderGrid();
				this.debouncedSave();
				new Notice('Canvas cleared.');
			}
		};

		// 4. Copy the codeblock
		const btnCopy = rightGroup.createEl('button', {
			cls: 'asciidraw-card-btn',
			text: '📋 Copy',
			title: 'Copy ASCII codeblock to clipboard'
		});
		btnCopy.onclick = async () => {
			const text = this.buffer.toString(true);
			const codeblock = `\`\`\`asciidraw\n${text}\n\`\`\``;
			await AsciiExporter.copyToClipboard(codeblock);
			new Notice('✓ Copied codeblock to clipboard!');
		};

		// 5. Open in full screen
		const btnFullscreen = rightGroup.createEl('button', {
			cls: 'asciidraw-card-btn asciidraw-card-btn-primary',
			text: '⛶ Fullscreen',
			title: 'Open in Fullscreen Studio'
		});
		btnFullscreen.onclick = () => this.openFullscreenStudio();
	}

	private updateLockState(): void {
		if (!this.gridSurfaceEl) return;
		if (this.inlineMode === 'lock') {
			this.gridSurfaceEl.setAttribute('draggable', 'true');
			this.gridSurfaceEl.addClass('is-locked-draggable');
			this.containerCard.addClass('is-locked');
		} else {
			this.gridSurfaceEl.removeAttribute('draggable');
			this.gridSurfaceEl.removeClass('is-locked-draggable');
			this.containerCard.removeClass('is-locked');
		}
	}

	private handleDragStart(e: DragEvent): void {
		if (this.inlineMode !== 'lock') {
			e.preventDefault();
			return;
		}

		const plainText = this.buffer.toString(true);
		const codeblock = `\`\`\`asciidraw\n${plainText}\n\`\`\``;
		const svgStr = AsciiExporter.toSVG(this.buffer, this.theme);

		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';
			e.dataTransfer.setData('text/plain', codeblock);
			e.dataTransfer.setData('text/html', `<div class="asciidraw-embed">${svgStr}</div>`);
			e.dataTransfer.setData('image/svg+xml', svgStr);
		}
	}

	private renderGrid(): void {
		if (!this.gridSurfaceEl) return;
		const cols = this.buffer.cols;
		const rows = this.buffer.rows;

		let html = '';
		for (let r = 0; r < rows; r++) {
			let rowHtml = '';
			for (let c = 0; c < cols; c++) {
				const cell = this.buffer.getCell(c, r);
				let ch = cell ? cell.char : ' ';
				if (ch === ' ') ch = '&nbsp;';
				rowHtml += `<span class="ascii-cell" data-col="${c}" data-row="${r}">${ch}</span>`;
			}
			html += `<div class="ascii-row">${rowHtml}</div>`;
		}

		this.gridSurfaceEl.innerHTML = html;
	}

	// =========================================================================
	// Pointer Events on Inline Surface
	// =========================================================================

	private getCellFromPointer(e: PointerEvent): { x: number; y: number } | null {
		const target = e.target as HTMLElement;
		if (!target || !target.classList.contains('ascii-cell')) return null;

		const col = parseInt(target.getAttribute('data-col') || '-1', 10);
		const row = parseInt(target.getAttribute('data-row') || '-1', 10);

		if (col >= 0 && row >= 0) return { x: col, y: row };
		return null;
	}

	private handlePointerDown(e: PointerEvent): void {
		if (this.inlineMode !== 'draw') return;
		const pt = this.getCellFromPointer(e);
		if (!pt) return;

		this.isDrawing = true;
		this.dragStartPos = pt;
		this.lastPointerPos = pt;

		if (this.activeTool === 'pencil') {
			this.buffer.setCell(pt.x, pt.y, { char: this.activeChar });
			this.renderGrid();
		} else if (this.activeTool === 'eraser') {
			this.buffer.setCell(pt.x, pt.y, { char: ' ' });
			this.renderGrid();
		} else if (this.activeTool === 'fill') {
			this.buffer.floodFill(pt.x, pt.y, this.activeChar);
			this.renderGrid();
			this.debouncedSave();
		} else if (this.activeTool === 'text') {
			const promptText = prompt('Enter text to stamp:');
			if (promptText) {
				this.buffer.drawText(pt.x, pt.y, promptText);
				this.renderGrid();
				this.debouncedSave();
			}
		}
	}

	private handlePointerMove(e: PointerEvent): void {
		if (!this.isDrawing || this.inlineMode !== 'draw') return;
		const pt = this.getCellFromPointer(e);
		if (!pt) return;

		if (this.activeTool === 'pencil' && this.lastPointerPos) {
			const points = this.buffer.getBresenhamPoints(this.lastPointerPos.x, this.lastPointerPos.y, pt.x, pt.y);
			for (const p of points) {
				this.buffer.setCell(p.x, p.y, { char: this.activeChar });
			}
			this.lastPointerPos = pt;
			this.renderGrid();
		} else if (this.activeTool === 'eraser' && this.lastPointerPos) {
			const points = this.buffer.getBresenhamPoints(this.lastPointerPos.x, this.lastPointerPos.y, pt.x, pt.y);
			for (const p of points) {
				this.buffer.setCell(p.x, p.y, { char: ' ' });
			}
			this.lastPointerPos = pt;
			this.renderGrid();
		}
	}

	private handlePointerUp(e: PointerEvent): void {
		if (!this.isDrawing || this.inlineMode !== 'draw') return;
		this.isDrawing = false;
		const pt = this.getCellFromPointer(e) || this.lastPointerPos;

		if (this.dragStartPos && pt) {
			const { x: x0, y: y0 } = this.dragStartPos;
			const { x: x1, y: y1 } = pt;

			if (this.activeTool === 'line') {
				this.buffer.drawLine(x0, y0, x1, y1, this.lineStyle);
			} else if (this.activeTool === 'arrow') {
				this.buffer.drawArrow(x0, y0, x1, y1, 'right', this.lineStyle);
			} else if (this.activeTool === 'box') {
				this.buffer.drawBox(x0, y0, x1, y1, this.boxStyle, false, ' ');
			} else if (this.activeTool === 'circle') {
				const rx = Math.abs(x1 - x0) / 2;
				const ry = Math.abs(y1 - y0) / 2;
				const xc = Math.min(x0, x1) + rx;
				const yc = Math.min(y0, y1) + ry;
				this.buffer.drawCircle(xc, yc, rx, ry, this.activeChar);
			}
		}

		this.dragStartPos = null;
		this.lastPointerPos = null;
		this.renderGrid();
		this.debouncedSave();
	}

	// =========================================================================
	// Persistence & Fullscreen Studio
	// =========================================================================

	private debouncedSave(): void {
		if (this.saveTimeout) window.clearTimeout(this.saveTimeout);

		this.saveTimeout = window.setTimeout(async () => {
			await this.saveContentToNote();
		}, 400);
	}

	private async saveContentToNote(): Promise<void> {
		const filePath = this.ctx.sourcePath;
		if (!filePath) return;

		const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
		if (!(abstractFile instanceof TFile)) return;

		const newContent = AsciiSerializer.serialize([this.buffer], this.theme, false);

		try {
			await this.app.vault.process(abstractFile, (fileContent) => {
				const escapedSource = this.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const exactRegex = new RegExp(`(\`\`\`(?:${this.lang})[\\r\\n]+)${escapedSource}([\\r\\n]+\`\`\`)`, 'm');

				if (exactRegex.test(fileContent)) {
					return fileContent.replace(exactRegex, `$1${newContent}$2`);
				}

				const genericRegex = new RegExp(`(\`\`\`(?:${this.lang})[\\r\\n]+)([\\s\\S]*?)([\\r\\n]+\`\`\`)`, 'm');
				if (genericRegex.test(fileContent)) {
					return fileContent.replace(genericRegex, `$1${newContent}$3`);
				}

				return fileContent;
			});

			this.source = newContent;
		} catch (err) {
			console.error('Failed to sync inline ASCII canvas to note:', err);
		}
	}

	private openFullscreenStudio(): void {
		const currentText = this.buffer.toString(false);
		const modal = new AsciiDrawModal(this.app, {
			initialContent: currentText,
			targetFile: this.ctx.sourcePath,
			onSave: async (newContent: string) => {
				this.source = newContent;
				const parsed = AsciiSerializer.parse(newContent);
				this.theme = parsed.theme;
				this.buffer.resize(parsed.cols, parsed.rows);
				if (parsed.frames && parsed.frames.length > 0) {
					this.buffer.fromString(parsed.frames[0]);
				}
				if (this.colsInputEl) this.colsInputEl.value = String(this.buffer.cols);
				if (this.rowsInputEl) this.rowsInputEl.value = String(this.buffer.rows);

				await this.saveContentToNote();
				this.renderGrid();
			}
		});

		modal.open();

		setTimeout(() => {
			modal.modalEl.addClass('is-fullscreen-immersive');
		}, 30);
	}
}
