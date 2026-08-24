import { App, Modal, Notice } from 'obsidian';
import {
	AsciiTool,
	AsciiTheme,
	BoxStyle,
	LineStyle,
	ArrowStyle,
	CHARACTER_PRESETS,
	THEME_PALETTES,
	AsciiStudioConfig,
	Point,
	SelectionRect
} from '../types';
import { GridBuffer } from '../core/GridBuffer';

import { LayerManager } from '../core/LayerManager';
import { TransformEngine } from '../core/TransformEngine';
import { AsciiSerializer } from '../utils/serializer';
import { AsciiExporter } from '../utils/exporter';

export class AsciiDrawModal extends Modal {
	private config: AsciiStudioConfig;

	private layerManager: LayerManager;
	private activeTool: AsciiTool = 'pencil';
	private activeChar = '█';
	private activeFg = '';
	private activeBg = '';
	private activeTheme: AsciiTheme = 'default';
	private boxStyle: BoxStyle = 'single';
	private lineStyle: LineStyle = 'single';
	private arrowStyle: ArrowStyle = 'right';
	private fillBox = false;

	// Viewport & Zoom
	private zoomScale = 1.0;
	private isFullscreen = false;
	private isDrawing = false;
	private lastPointerPos: Point | null = null;
	private dragStartPos: Point | null = null;

	// Selection & Clipboard
	private selectionRect: SelectionRect | null = null;

	// Undo / Redo History Stack
	private historyStack: string[] = [];
	private historyIndex = -1;

	// DOM Elements
	private containerElModal!: HTMLElement;
	private canvasGridEl!: HTMLElement;

	private layersListEl!: HTMLElement;
	private activeCharPreviewEl!: HTMLElement;
	private statusEl!: HTMLElement;

	constructor(app: App, config: AsciiStudioConfig = {}) {
		super(app);
		this.config = config;

		const parsed = AsciiSerializer.parse(config.initialContent || '');
		this.activeTheme = parsed.theme;

		this.layerManager = new LayerManager(parsed.cols, parsed.rows);
		if (parsed.layers && parsed.layers.length > 0) {
			this.layerManager.loadLayerData(parsed.layers, parsed.cols, parsed.rows);
		} else if (parsed.frames && parsed.frames.length > 0) {
			this.layerManager.getActiveBuffer().fromString(parsed.frames[0]);
		}

		this.pushHistory();
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('asciidraw-modal-window');
		contentEl.empty();
		contentEl.addClass('asciidraw-studio-container');
		this.containerElModal = contentEl;

		this.buildUI();
		this.renderCanvas();
		this.renderLayersList();

		// Keyboard Shortcuts
		this.scope.register(['Mod'], 'z', (evt) => {
			evt.preventDefault();
			this.undo();
		});
		this.scope.register(['Mod', 'Shift'], 'z', (evt) => {
			evt.preventDefault();
			this.redo();
		});
		this.scope.register(['Mod'], 'y', (evt) => {
			evt.preventDefault();
			this.redo();
		});
		this.scope.register(['Mod'], 's', (evt) => {
			evt.preventDefault();
			this.handleSave();
		});
		this.scope.register([], 'Escape', () => {
			if (this.selectionRect) {
				this.selectionRect = null;
				this.renderCanvas();
			} else {
				this.close();
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// =========================================================================
	// UI Builder
	// =========================================================================

	private buildUI(): void {
		this.containerElModal.empty();

		// 1. Top Navigation Bar
		const topNav = this.containerElModal.createDiv({ cls: 'asciidraw-topnav' });
		this.buildTopNav(topNav);

		// 2. Middle Main Workspace (Left Toolbar + Center Canvas + Right Sidebar)
		const mainArea = this.containerElModal.createDiv({ cls: 'asciidraw-workspace' });

		const leftToolbar = mainArea.createDiv({ cls: 'asciidraw-left-toolbar' });
		this.buildLeftToolbar(leftToolbar);

		const canvasViewport = mainArea.createDiv({ cls: 'asciidraw-canvas-viewport' });
		this.buildCanvasViewport(canvasViewport);

		const rightSidebar = mainArea.createDiv({ cls: 'asciidraw-right-sidebar' });
		this.buildRightSidebar(rightSidebar);


	}

	private buildTopNav(parent: HTMLElement): void {
		const leftGroup = parent.createDiv({ cls: 'asciidraw-nav-group' });

		// Logo / Title
		const title = leftGroup.createDiv({ cls: 'asciidraw-nav-title' });
		title.innerHTML = `<span class="asciidraw-logo-icon">🔲</span> ASCII Studio`;

		// Canvas Dimension Selector & Custom Inputs
		const sizeSelector = leftGroup.createEl('select', { cls: 'asciidraw-select' });
		const presets = [
			{ label: 'Compact (40x15)', cols: 40, rows: 15 },
			{ label: 'Standard (60x20)', cols: 60, rows: 20 },
			{ label: 'Wide Terminal (80x24)', cols: 80, rows: 24 },
			{ label: 'HD Grid (100x30)', cols: 100, rows: 30 },
			{ label: 'Ultra Wide (120x40)', cols: 120, rows: 40 },
			{ label: 'Custom...', cols: 0, rows: 0 }
		];

		const curCols = this.layerManager.cols;
		const curRows = this.layerManager.rows;

		presets.forEach(p => {
			const opt = sizeSelector.createEl('option', { text: p.label, value: `${p.cols}x${p.rows}` });
			if (p.cols === curCols && p.rows === curRows) opt.selected = true;
		});

		// Custom dimension inputs
		const customSizeBox = leftGroup.createDiv({ cls: 'asciidraw-custom-size-box' });
		customSizeBox.createSpan({ text: 'W:' });
		const inputCols = customSizeBox.createEl('input', {
			type: 'number',
			cls: 'asciidraw-size-input',
			value: String(curCols),
			attr: { min: '5', max: '300', title: 'Custom Width (Cols)' }
		});
		customSizeBox.createSpan({ text: 'H:' });
		const inputRows = customSizeBox.createEl('input', {
			type: 'number',
			cls: 'asciidraw-size-input',
			value: String(curRows),
			attr: { min: '3', max: '200', title: 'Custom Height (Rows)' }
		});

		const applyCustomSize = () => {
			const w = Math.max(5, parseInt(inputCols.value, 10) || 60);
			const h = Math.max(3, parseInt(inputRows.value, 10) || 20);
			this.layerManager.resizeAll(w, h);
	
			this.renderCanvas();
			this.pushHistory();
		};
		inputCols.onchange = applyCustomSize;
		inputRows.onchange = applyCustomSize;

		sizeSelector.addEventListener('change', () => {
			if (sizeSelector.value !== '0x0') {
				const [w, h] = sizeSelector.value.split('x').map(n => parseInt(n, 10));
				inputCols.value = String(w);
				inputRows.value = String(h);
				this.layerManager.resizeAll(w, h);

				this.renderCanvas();
				this.pushHistory();
			}
		});

		// Theme Selector
		const themeSelector = leftGroup.createEl('select', { cls: 'asciidraw-select' });
		Object.entries(THEME_PALETTES).forEach(([key, val]) => {
			const opt = themeSelector.createEl('option', { text: val.label, value: key });
			if (key === this.activeTheme) opt.selected = true;
		});

		themeSelector.addEventListener('change', () => {
			this.activeTheme = themeSelector.value as AsciiTheme;
			this.applyTheme();
			this.renderCanvas();
		});

		// Center Controls: Zoom & History
		const centerGroup = parent.createDiv({ cls: 'asciidraw-nav-group' });

		const btnZoomOut = centerGroup.createEl('button', { text: '−', cls: 'asciidraw-btn-icon', title: 'Zoom Out' });
		btnZoomOut.onclick = () => this.adjustZoom(-0.15);

		centerGroup.createSpan({ text: `${Math.round(this.zoomScale * 100)}%`, cls: 'asciidraw-zoom-label' });

		const btnZoomIn = centerGroup.createEl('button', { text: '+', cls: 'asciidraw-btn-icon', title: 'Zoom In' });
		btnZoomIn.onclick = () => this.adjustZoom(0.15);

		const btnUndo = centerGroup.createEl('button', { text: '↩ Undo', cls: 'asciidraw-btn-sm', title: 'Undo (Ctrl+Z)' });
		btnUndo.onclick = () => this.undo();

		const btnRedo = centerGroup.createEl('button', { text: '↪ Redo', cls: 'asciidraw-btn-sm', title: 'Redo (Ctrl+Y)' });
		btnRedo.onclick = () => this.redo();

		// Right Actions: Fullscreen, Export, Save
		const rightGroup = parent.createDiv({ cls: 'asciidraw-nav-group' });

		const btnFullscreen = rightGroup.createEl('button', {
			text: this.isFullscreen ? 'Exit Fullscreen' : '⛶ Fullscreen',
			cls: 'asciidraw-btn-sm',
			title: 'Toggle Fullscreen Mode'
		});
		btnFullscreen.onclick = () => this.toggleFullscreen();

		const btnExport = rightGroup.createEl('button', { text: 'Export ▾', cls: 'asciidraw-btn-sm' });
		btnExport.onclick = (e) => this.showExportMenu(e);

		const btnSave = rightGroup.createEl('button', {
			text: '💾 Save to Note',
			cls: 'asciidraw-btn-primary',
			title: 'Save changes directly into note codeblock'
		});
		btnSave.onclick = () => this.handleSave();
	}

	private buildLeftToolbar(parent: HTMLElement): void {
		const toolGroup = parent.createDiv({ cls: 'asciidraw-toolrack' });

		const tools: { id: AsciiTool; icon: string; name: string; shortcut: string }[] = [
			{ id: 'pencil', icon: '✏️', name: 'Pencil / Stamp', shortcut: 'P' },
			{ id: 'eraser', icon: '🧼', name: 'Eraser', shortcut: 'E' },
			{ id: 'line', icon: '📏', name: 'Straight Line', shortcut: 'L' },
			{ id: 'arrow', icon: '➔', name: 'Directional Arrow', shortcut: 'A' },
			{ id: 'box', icon: '🔲', name: 'Box / Rectangle', shortcut: 'B' },
			{ id: 'circle', icon: '⭕', name: 'Circle / Ellipse', shortcut: 'C' },
			{ id: 'fill', icon: '🪣', name: 'Flood Fill', shortcut: 'F' },
			{ id: 'text', icon: '🔤', name: 'Monospace Text', shortcut: 'T' },
			{ id: 'select', icon: '✂️', name: 'Marquee Selection', shortcut: 'S' },
			{ id: 'transform', icon: '🔄', name: 'Transform Gizmo', shortcut: 'M' }
		];

		tools.forEach(t => {
			const btn = toolGroup.createEl('button', {
				cls: `asciidraw-tool-btn ${this.activeTool === t.id ? 'is-active' : ''}`,
				title: `${t.name} (${t.shortcut})`
			});
			btn.innerHTML = `<span class="tool-icon">${t.icon}</span><span class="tool-label">${t.name}</span>`;

			btn.onclick = () => {
				this.setTool(t.id);
				parent.querySelectorAll('.asciidraw-tool-btn').forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
			};
		});

		// Tool options sub-bar (box style, fill, arrow type)
		const subOpts = parent.createDiv({ cls: 'asciidraw-tool-suboptions' });

		const boxStyleSelect = subOpts.createEl('select', { cls: 'asciidraw-select-mini' });
		['single', 'double', 'rounded', 'solid', 'ascii', 'dashed'].forEach(style => {
			const opt = boxStyleSelect.createEl('option', { text: `${style} border`, value: style });
			if (style === this.boxStyle) opt.selected = true;
		});
		boxStyleSelect.onchange = () => {
			this.boxStyle = boxStyleSelect.value as BoxStyle;
			this.lineStyle = (boxStyleSelect.value === 'double' ? 'double' : (boxStyleSelect.value === 'ascii' ? 'ascii' : 'single')) as LineStyle;
		};

		const fillToggle = subOpts.createEl('label', { cls: 'asciidraw-checkbox-label' });
		const fillCb = fillToggle.createEl('input', { type: 'checkbox' });
		fillCb.checked = this.fillBox;
		fillToggle.createSpan({ text: ' Filled' });
		fillCb.onchange = () => {
			this.fillBox = fillCb.checked;
		};
	}

	private buildCanvasViewport(parent: HTMLElement): void {
		const wrapper = parent.createDiv({ cls: 'asciidraw-canvas-wrapper' });

		this.canvasGridEl = wrapper.createDiv({ cls: 'asciidraw-grid-surface' });
		this.canvasGridEl.style.touchAction = 'none';

		this.canvasGridEl.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
		window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
		window.addEventListener('pointerup', (e) => this.handlePointerUp(e));

		this.statusEl = parent.createDiv({ cls: 'asciidraw-status-bar' });
		this.updateStatus('Ready • Select a tool and start drawing');
	}

	private buildRightSidebar(parent: HTMLElement): void {
		// 1. Photoshop-style Drag-Sortable Layers Panel
		this.buildLayersSection(parent);

		// 2. Active Character preview & Custom Input
		const activeCharSection = parent.createDiv({ cls: 'asciidraw-sidebar-section' });
		activeCharSection.createEl('h4', { text: 'Active Character' });

		const previewRow = activeCharSection.createDiv({ cls: 'asciidraw-char-preview-row' });
		this.activeCharPreviewEl = previewRow.createDiv({ cls: 'asciidraw-char-badge', text: this.activeChar });

		const customInput = previewRow.createEl('input', {
			cls: 'asciidraw-input-char',
			type: 'text',
			value: this.activeChar,
			attr: { maxlength: '2' }
		});
		customInput.oninput = () => {
			if (customInput.value) {
				this.setActiveChar(customInput.value[0]);
			}
		};

		// 3. Presets Sections
		CHARACTER_PRESETS.forEach(group => {
			const section = parent.createDiv({ cls: 'asciidraw-sidebar-section' });
			section.createEl('h4', { text: group.title });

			const grid = section.createDiv({ cls: 'asciidraw-palette-grid' });
			group.chars.forEach(ch => {
				const tile = grid.createEl('button', { cls: 'asciidraw-char-tile', text: ch });
				tile.onclick = () => {
					this.setActiveChar(ch);
					customInput.value = ch;
				};
			});
		});

		// 4. Transform & Quick Actions
		const actionsSection = parent.createDiv({ cls: 'asciidraw-sidebar-section' });
		actionsSection.createEl('h4', { text: 'Canvas Actions' });

		const actionGrid = actionsSection.createDiv({ cls: 'asciidraw-action-grid' });

		const btnFlipH = actionGrid.createEl('button', { text: '⇄ Flip H', cls: 'asciidraw-btn-sm' });
		btnFlipH.onclick = () => this.applyFlipH();

		const btnFlipV = actionGrid.createEl('button', { text: '⇅ Flip V', cls: 'asciidraw-btn-sm' });
		btnFlipV.onclick = () => this.applyFlipV();

		const btnRotate = actionGrid.createEl('button', { text: '⟳ Rotate 90°', cls: 'asciidraw-btn-sm' });
		btnRotate.onclick = () => this.applyRotate90();

		const btnClear = actionGrid.createEl('button', { text: '🗑️ Clear Active Layer', cls: 'asciidraw-btn-danger' });
		btnClear.onclick = () => {
			this.layerManager.getActiveBuffer().clear();
			this.renderCanvas();
			this.pushHistory();
		};
	}

	// =========================================================================
	// Photoshop-Style Drag-Sortable Layers Panel
	// =========================================================================

	private buildLayersSection(parent: HTMLElement): void {
		const layerSection = parent.createDiv({ cls: 'asciidraw-sidebar-section asciidraw-layers-section' });

		const headerRow = layerSection.createDiv({ cls: 'asciidraw-layers-header' });
		headerRow.createEl('h4', { text: 'Layers' });

		const layerActions = headerRow.createDiv({ cls: 'asciidraw-layer-header-actions' });

		const btnAdd = layerActions.createEl('button', { text: '+ New', cls: 'asciidraw-btn-mini', title: 'Add New Layer' });
		btnAdd.onclick = () => {
			this.layerManager.addLayer();
			this.renderLayersList();
			this.renderCanvas();
			this.pushHistory();
		};

		const btnDup = layerActions.createEl('button', { text: '📋', cls: 'asciidraw-btn-mini', title: 'Duplicate Layer' });
		btnDup.onclick = () => {
			this.layerManager.duplicateLayer();
			this.renderLayersList();
			this.renderCanvas();
			this.pushHistory();
		};

		const btnMerge = layerActions.createEl('button', { text: '⮛', cls: 'asciidraw-btn-mini', title: 'Merge Down' });
		btnMerge.onclick = () => {
			this.layerManager.mergeDown();
			this.renderLayersList();
			this.renderCanvas();
			this.pushHistory();
		};

		const btnDel = layerActions.createEl('button', { text: '🗑️', cls: 'asciidraw-btn-mini', title: 'Delete Layer' });
		btnDel.onclick = () => {
			this.layerManager.deleteLayer();
			this.renderLayersList();
			this.renderCanvas();
			this.pushHistory();
		};

		this.layersListEl = layerSection.createDiv({ cls: 'asciidraw-layers-list' });
	}

	private renderLayersList(): void {
		if (!this.layersListEl) return;
		this.layersListEl.empty();

		const lm = this.layerManager;
		// Render in reverse order so topmost layer is displayed at the top of the list (Photoshop style)
		for (let i = lm.layers.length - 1; i >= 0; i--) {
			const layer = lm.layers[i];
			const layerIndex = i;

			const item = this.layersListEl.createDiv({
				cls: `asciidraw-layer-item ${layerIndex === lm.activeLayerIndex ? 'is-active' : ''}`
			});
			item.draggable = true;

			// Drag handle
			const dragHandle = item.createSpan({ cls: 'layer-drag-handle', text: '⋮⋮', title: 'Drag to reorder layer' });

			// Eye Visibility Toggle
			const eyeBtn = item.createSpan({
				cls: `layer-eye-btn ${layer.visible ? 'is-visible' : 'is-hidden'}`,
				text: layer.visible ? '👁' : '🚫',
				title: layer.visible ? 'Hide Layer' : 'Show Layer'
			});
			eyeBtn.onclick = (e) => {
				e.stopPropagation();
				lm.toggleVisibility(layerIndex);
				this.renderLayersList();
				this.renderCanvas();
				this.pushHistory();
			};

			// Lock Toggle
			const lockBtn = item.createSpan({
				cls: `layer-lock-btn ${layer.locked ? 'is-locked' : ''}`,
				text: layer.locked ? '🔒' : '🔓',
				title: layer.locked ? 'Unlock Layer' : 'Lock Layer'
			});
			lockBtn.onclick = (e) => {
				e.stopPropagation();
				lm.toggleLock(layerIndex);
				this.renderLayersList();
				this.pushHistory();
			};

			// Layer Name (Click to select, double-click to rename)
			const nameEl = item.createSpan({ cls: 'layer-name', text: layer.name });
			nameEl.ondblclick = (e) => {
				e.stopPropagation();
				const newName = prompt('Rename Layer:', layer.name);
				if (newName) {
					lm.renameLayer(layerIndex, newName);
					this.renderLayersList();
					this.pushHistory();
				}
			};

			// Quick Up / Down Reorder Buttons for tablet/touch
			const reorderGroup = item.createDiv({ cls: 'layer-reorder-group' });
			if (layerIndex < lm.layers.length - 1) {
				const upBtn = reorderGroup.createSpan({ cls: 'layer-shift-btn', text: '▲', title: 'Move Up' });
				upBtn.onclick = (e) => {
					e.stopPropagation();
					lm.reorderLayers(layerIndex, layerIndex + 1);
					this.renderLayersList();
					this.renderCanvas();
					this.pushHistory();
				};
			}
			if (layerIndex > 0) {
				const downBtn = reorderGroup.createSpan({ cls: 'layer-shift-btn', text: '▼', title: 'Move Down' });
				downBtn.onclick = (e) => {
					e.stopPropagation();
					lm.reorderLayers(layerIndex, layerIndex - 1);
					this.renderLayersList();
					this.renderCanvas();
					this.pushHistory();
				};
			}

			// Select active layer on row click
			item.onclick = () => {
				lm.setActiveLayer(layerIndex);
				this.renderLayersList();
				this.updateStatus(`Active Layer: ${layer.name}`);
			};

			// HTML5 Drag and Drop Handlers for drag-sorting
			item.addEventListener('dragstart', (e) => {
				e.dataTransfer?.setData('text/plain', String(layerIndex));
				item.addClass('is-dragging');
			});

			item.addEventListener('dragend', () => {
				item.removeClass('is-dragging');
				this.layersListEl.querySelectorAll('.asciidraw-layer-item').forEach(el => el.removeClass('is-drag-over'));
			});

			item.addEventListener('dragover', (e) => {
				e.preventDefault();
				item.addClass('is-drag-over');
			});

			item.addEventListener('dragleave', () => {
				item.removeClass('is-drag-over');
			});

			item.addEventListener('drop', (e) => {
				e.preventDefault();
				item.removeClass('is-drag-over');
				const fromIdx = parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
				if (fromIdx >= 0 && fromIdx !== layerIndex) {
					lm.reorderLayers(fromIdx, layerIndex);
					this.renderLayersList();
					this.renderCanvas();
					this.pushHistory();
					new Notice(`Reordered: ${layer.name}`);
				}
			});
		}
	}

	// =========================================================================
	// Canvas Rendering (Compositing All Visible Layers)
	// =========================================================================

	private renderCanvas(): void {
		if (!this.canvasGridEl) return;
		const composite = this.layerManager.getCompositeBuffer();
		const cols = composite.cols;
		const rows = composite.rows;

		this.canvasGridEl.style.transform = `scale(${this.zoomScale})`;
		this.canvasGridEl.style.transformOrigin = 'top left';

		const palette = THEME_PALETTES[this.activeTheme] || THEME_PALETTES.default;
		this.canvasGridEl.style.backgroundColor = palette.bg;
		this.canvasGridEl.style.borderColor = palette.border;

		let htmlContent = '';
		for (let r = 0; r < rows; r++) {
			let rowStr = '';
			for (let c = 0; c < cols; c++) {
				const cell = composite.getCell(c, r);
				let charToDisplay = cell ? cell.char : ' ';
				if (charToDisplay === ' ') charToDisplay = '&nbsp;';

				const fgStyle = cell?.fg ? `color: ${cell.fg};` : `color: ${palette.fg};`;
				const bgStyle = cell?.bg ? `background-color: ${cell.bg};` : '';

				rowStr += `<span class="ascii-cell" data-col="${c}" data-row="${r}" style="${fgStyle}${bgStyle}">${charToDisplay}</span>`;
			}
			htmlContent += `<div class="ascii-row">${rowStr}</div>`;
		}

		this.canvasGridEl.innerHTML = htmlContent;
	}



	private applyTheme(): void {
		const palette = THEME_PALETTES[this.activeTheme] || THEME_PALETTES.default;
		this.containerElModal.style.setProperty('--asciidraw-fg', palette.fg);
		this.containerElModal.style.setProperty('--asciidraw-bg', palette.bg);
		this.containerElModal.style.setProperty('--asciidraw-border', palette.border);
		this.containerElModal.style.setProperty('--asciidraw-accent', palette.accent);
	}

	// =========================================================================
	// Pointer & Drawing Handlers
	// =========================================================================

	private getCellFromPointer(e: PointerEvent): Point | null {
		const target = e.target as HTMLElement;
		if (!target || !target.classList.contains('ascii-cell')) {
			const rect = this.canvasGridEl.getBoundingClientRect();
			const relX = (e.clientX - rect.left) / this.zoomScale;
			const relY = (e.clientY - rect.top) / this.zoomScale;

			const cur = this.layerManager.getActiveBuffer();
			const cellW = rect.width / (cur.cols * this.zoomScale);
			const cellH = rect.height / (cur.rows * this.zoomScale);

			const col = Math.floor(relX / cellW);
			const row = Math.floor(relY / cellH);

			if (cur.inBounds(col, row)) return { x: col, y: row };
			return null;
		}

		const col = parseInt(target.getAttribute('data-col') || '-1', 10);
		const row = parseInt(target.getAttribute('data-row') || '-1', 10);

		if (col >= 0 && row >= 0) return { x: col, y: row };
		return null;
	}

	private handlePointerDown(e: PointerEvent): void {
		e.preventDefault();

		const activeLayer = this.layerManager.getActiveLayer();
		if (activeLayer.locked) {
			new Notice(`Layer "${activeLayer.name}" is locked. Unlock to edit.`);
			return;
		}
		if (!activeLayer.visible) {
			new Notice(`Layer "${activeLayer.name}" is hidden. Make visible to edit.`);
			return;
		}

		const pt = this.getCellFromPointer(e);
		if (!pt) return;

		this.isDrawing = true;
		this.dragStartPos = pt;
		this.lastPointerPos = pt;

		const frame = activeLayer.buffer;

		if (this.activeTool === 'pencil') {
			frame.setCell(pt.x, pt.y, { char: this.activeChar, fg: this.activeFg, bg: this.activeBg });
			this.renderCanvas();
		} else if (this.activeTool === 'eraser') {
			frame.setCell(pt.x, pt.y, { char: ' ', fg: undefined, bg: undefined });
			this.renderCanvas();
		} else if (this.activeTool === 'fill') {
			frame.floodFill(pt.x, pt.y, this.activeChar, this.activeFg, this.activeBg);
			this.renderCanvas();
			this.pushHistory();
		} else if (this.activeTool === 'text') {
			const promptText = prompt('Enter text to insert:');
			if (promptText) {
				frame.drawText(pt.x, pt.y, promptText, this.activeFg, this.activeBg);
				this.renderCanvas();
				this.pushHistory();
			}
		} else if (this.activeTool === 'select') {
			this.selectionRect = { startX: pt.x, startY: pt.y, endX: pt.x, endY: pt.y };
		}
	}

	private handlePointerMove(e: PointerEvent): void {
		if (!this.isDrawing) return;
		const pt = this.getCellFromPointer(e);
		if (!pt) return;

		const activeLayer = this.layerManager.getActiveLayer();
		const frame = activeLayer.buffer;

		if (this.activeTool === 'pencil' && this.lastPointerPos) {
			const points = frame.getBresenhamPoints(this.lastPointerPos.x, this.lastPointerPos.y, pt.x, pt.y);
			for (const p of points) {
				frame.setCell(p.x, p.y, { char: this.activeChar, fg: this.activeFg, bg: this.activeBg });
			}
			this.lastPointerPos = pt;
			this.renderCanvas();
		} else if (this.activeTool === 'eraser' && this.lastPointerPos) {
			const points = frame.getBresenhamPoints(this.lastPointerPos.x, this.lastPointerPos.y, pt.x, pt.y);
			for (const p of points) {
				frame.setCell(p.x, p.y, { char: ' ' });
			}
			this.lastPointerPos = pt;
			this.renderCanvas();
		} else if (this.activeTool === 'select' && this.dragStartPos) {
			this.selectionRect = {
				startX: this.dragStartPos.x,
				startY: this.dragStartPos.y,
				endX: pt.x,
				endY: pt.y
			};
		}
	}

	private handlePointerUp(e: PointerEvent): void {
		if (!this.isDrawing) return;
		this.isDrawing = false;
		const pt = this.getCellFromPointer(e) || this.lastPointerPos;

		if (this.dragStartPos && pt) {
			const activeLayer = this.layerManager.getActiveLayer();
			const frame = activeLayer.buffer;
			const { x: x0, y: y0 } = this.dragStartPos;
			const { x: x1, y: y1 } = pt;

			if (this.activeTool === 'line') {
				frame.drawLine(x0, y0, x1, y1, this.lineStyle, this.activeFg, this.activeBg);
			} else if (this.activeTool === 'arrow') {
				frame.drawArrow(x0, y0, x1, y1, this.arrowStyle, this.lineStyle, this.activeFg, this.activeBg);
			} else if (this.activeTool === 'box') {
				frame.drawBox(x0, y0, x1, y1, this.boxStyle, this.fillBox, this.activeChar, this.activeFg, this.activeBg);
			} else if (this.activeTool === 'circle') {
				const rx = Math.abs(x1 - x0) / 2;
				const ry = Math.abs(y1 - y0) / 2;
				const xc = Math.min(x0, x1) + rx;
				const yc = Math.min(y0, y1) + ry;
				frame.drawCircle(xc, yc, rx, ry, this.activeChar, this.fillBox, this.activeChar, this.activeFg, this.activeBg);
			}
		}

		this.dragStartPos = null;
		this.lastPointerPos = null;
		this.renderCanvas();
		this.pushHistory();
	}

	// =========================================================================
	// Tool & State Management
	// =========================================================================

	private setTool(tool: AsciiTool): void {
		this.activeTool = tool;
		this.updateStatus(`Tool selected: ${tool.toUpperCase()}`);
	}

	private setActiveChar(char: string): void {
		this.activeChar = char;
		if (this.activeCharPreviewEl) {
			this.activeCharPreviewEl.textContent = char;
		}
		this.updateStatus(`Active character set to: "${char}"`);
	}

	private adjustZoom(delta: number): void {
		this.zoomScale = Math.min(3.0, Math.max(0.4, this.zoomScale + delta));
		this.renderCanvas();
		const zoomLabel = this.containerElModal.querySelector('.asciidraw-zoom-label');
		if (zoomLabel) zoomLabel.textContent = `${Math.round(this.zoomScale * 100)}%`;
	}

	private toggleFullscreen(): void {
		this.isFullscreen = !this.isFullscreen;
		this.modalEl.toggleClass('is-fullscreen-immersive', this.isFullscreen);
		this.containerElModal.toggleClass('is-fullscreen-immersive', this.isFullscreen);
		new Notice(this.isFullscreen ? 'Entered Immersive Fullscreen Mode' : 'Exited Fullscreen Mode');
	}

	private updateStatus(text: string): void {
		if (this.statusEl) {
			this.statusEl.textContent = text;
		}
	}

	// =========================================================================
	// Transformations
	// =========================================================================

	private applyFlipH(): void {
		const frame = this.layerManager.getActiveBuffer();
		frame.cells = TransformEngine.flipHorizontal(frame.cells);
		this.renderCanvas();
		this.pushHistory();
		new Notice('Flipped Active Layer Horizontally');
	}

	private applyFlipV(): void {
		const frame = this.layerManager.getActiveBuffer();
		frame.cells = TransformEngine.flipVertical(frame.cells);
		this.renderCanvas();
		this.pushHistory();
		new Notice('Flipped Active Layer Vertically');
	}

	private applyRotate90(): void {
		const frame = this.layerManager.getActiveBuffer();
		frame.cells = TransformEngine.rotate90(frame.cells);
		this.renderCanvas();
		this.pushHistory();
		new Notice('Rotated Active Layer 90° Clockwise');
	}

	// =========================================================================
	// History (Undo / Redo)
	// =========================================================================

	private pushHistory(): void {
		const serialized = AsciiSerializer.serialize(
			[this.layerManager.getCompositeBuffer()],
			this.activeTheme,
			true,
			this.layerManager.exportLayerData()
		);

		if (this.historyIndex < this.historyStack.length - 1) {
			this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
		}

		this.historyStack.push(serialized);
		this.historyIndex = this.historyStack.length - 1;
	}

	private undo(): void {
		if (this.historyIndex > 0) {
			this.historyIndex--;
			this.restoreSnapshot(this.historyStack[this.historyIndex]);
		}
	}

	private redo(): void {
		if (this.historyIndex < this.historyStack.length - 1) {
			this.historyIndex++;
			this.restoreSnapshot(this.historyStack[this.historyIndex]);
		}
	}

	private restoreSnapshot(snapshot: string): void {
		const parsed = AsciiSerializer.parse(snapshot);
		if (parsed.layers && parsed.layers.length > 0) {
			this.layerManager.loadLayerData(parsed.layers, parsed.cols, parsed.rows);
		} else if (parsed.frames && parsed.frames.length > 0) {
			this.layerManager.getActiveBuffer().fromString(parsed.frames[0]);
		}
		this.renderLayersList();
		this.renderCanvas();
	}

	// =========================================================================
	// Save & Export Handlers
	// =========================================================================

	private async handleSave(): Promise<void> {
		const layersData = this.layerManager.exportLayerData();
		const composite = this.layerManager.getCompositeBuffer();

		const serialized = AsciiSerializer.serialize(
			[composite],
			this.activeTheme,
			layersData.length > 1 || this.activeTheme !== 'default',
			layersData
		);

		if (this.config.onSave) {
			await this.config.onSave(serialized);
			new Notice('✓ ASCII drawing saved to note!');
		} else {
			await AsciiExporter.copyToClipboard(serialized);
			new Notice('✓ Copied ASCII codeblock to clipboard!');
		}

		this.close();
	}

	private showExportMenu(e: MouseEvent): void {
		const menu = createDiv({ cls: 'asciidraw-export-dropdown' });
		const composite = this.layerManager.getCompositeBuffer();

		const optCopy = menu.createDiv({ text: '📋 Copy Plain ASCII Text' });
		optCopy.onclick = async () => {
			await AsciiExporter.copyToClipboard(composite.toString(true));
			new Notice('Copied plain ASCII text to clipboard!');
			menu.remove();
		};

		const optSvg = menu.createDiv({ text: '🖼️ Download Vector SVG' });
		optSvg.onclick = () => {
			const svg = AsciiExporter.toSVG(composite, this.activeTheme);
			AsciiExporter.downloadFile('drawing.svg', svg, 'image/svg+xml');
			new Notice('Downloaded drawing.svg');
			menu.remove();
		};

		const optPng = menu.createDiv({ text: '📸 Download PNG Image' });
		optPng.onclick = () => {
			const png = AsciiExporter.toPNG(composite, this.activeTheme);
			const a = document.createElement('a');
			a.href = png;
			a.download = 'drawing.png';
			a.click();
			new Notice('Downloaded drawing.png');
			menu.remove();
		};

		const target = e.target as HTMLElement;
		const rect = target.getBoundingClientRect();
		menu.style.position = 'fixed';
		menu.style.left = `${rect.left}px`;
		menu.style.top = `${rect.bottom + 6}px`;
		document.body.appendChild(menu);

		const closeDropdown = (evt: MouseEvent) => {
			if (!menu.contains(evt.target as Node)) {
				menu.remove();
				document.removeEventListener('click', closeDropdown);
			}
		};
		setTimeout(() => document.addEventListener('click', closeDropdown), 10);
	}
}
