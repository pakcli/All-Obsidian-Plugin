import { GridBuffer } from './GridBuffer';
import { LayerData } from '../types';

export interface AsciiLayer {
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	opacity: number;
	buffer: GridBuffer;
}

export class LayerManager {
	public layers: AsciiLayer[] = [];
	public activeLayerIndex = 0;
	public cols: number;
	public rows: number;

	constructor(cols = 60, rows = 20, initialContent?: string) {
		this.cols = cols;
		this.rows = rows;

		const baseLayer: AsciiLayer = {
			id: 'layer-' + Math.random().toString(36).substring(2, 9),
			name: 'Layer 1',
			visible: true,
			locked: false,
			opacity: 1.0,
			buffer: new GridBuffer(cols, rows)
		};

		if (initialContent) {
			baseLayer.buffer.fromString(initialContent);
		}

		this.layers.push(baseLayer);
		this.activeLayerIndex = 0;
	}

	public getActiveLayer(): AsciiLayer {
		if (this.layers.length === 0) {
			this.addLayer('Layer 1');
		}
		if (this.activeLayerIndex < 0 || this.activeLayerIndex >= this.layers.length) {
			this.activeLayerIndex = Math.max(0, this.layers.length - 1);
		}
		return this.layers[this.activeLayerIndex];
	}

	public getActiveBuffer(): GridBuffer {
		return this.getActiveLayer().buffer;
	}

	public setActiveLayer(index: number): void {
		if (index >= 0 && index < this.layers.length) {
			this.activeLayerIndex = index;
		}
	}

	public addLayer(name?: string, aboveActive = true): AsciiLayer {
		const count = this.layers.length + 1;
		const layerName = name || `Layer ${count}`;
		const newLayer: AsciiLayer = {
			id: 'layer-' + Math.random().toString(36).substring(2, 9),
			name: layerName,
			visible: true,
			locked: false,
			opacity: 1.0,
			buffer: new GridBuffer(this.cols, this.rows)
		};

		if (aboveActive && this.layers.length > 0) {
			// In Photoshop layer lists, index 0 is top or bottom. Here: index 0 is bottom, highest index is top.
			const insertIdx = this.activeLayerIndex + 1;
			this.layers.splice(insertIdx, 0, newLayer);
			this.activeLayerIndex = insertIdx;
		} else {
			this.layers.push(newLayer);
			this.activeLayerIndex = this.layers.length - 1;
		}

		return newLayer;
	}

	public duplicateLayer(index?: number): AsciiLayer {
		const targetIdx = index !== undefined ? index : this.activeLayerIndex;
		const source = this.layers[targetIdx] || this.getActiveLayer();

		const copyLayer: AsciiLayer = {
			id: 'layer-' + Math.random().toString(36).substring(2, 9),
			name: `${source.name} Copy`,
			visible: source.visible,
			locked: source.locked,
			opacity: source.opacity,
			buffer: source.buffer.clone()
		};

		const insertIdx = targetIdx + 1;
		this.layers.splice(insertIdx, 0, copyLayer);
		this.activeLayerIndex = insertIdx;
		return copyLayer;
	}

	public deleteLayer(index?: number): boolean {
		if (this.layers.length <= 1) {
			// Don't delete the only layer, clear it instead
			this.getActiveLayer().buffer.clear();
			return false;
		}

		const targetIdx = index !== undefined ? index : this.activeLayerIndex;
		this.layers.splice(targetIdx, 1);
		if (this.activeLayerIndex >= this.layers.length) {
			this.activeLayerIndex = this.layers.length - 1;
		}
		return true;
	}

	public reorderLayers(fromIndex: number, toIndex: number): void {
		if (fromIndex < 0 || fromIndex >= this.layers.length) return;
		if (toIndex < 0 || toIndex >= this.layers.length) return;
		if (fromIndex === toIndex) return;

		const [moved] = this.layers.splice(fromIndex, 1);
		this.layers.splice(toIndex, 0, moved);
		this.activeLayerIndex = toIndex;
	}

	public mergeDown(index?: number): void {
		const targetIdx = index !== undefined ? index : this.activeLayerIndex;
		if (targetIdx <= 0 || targetIdx >= this.layers.length) return; // Cannot merge bottom layer down

		const topLayer = this.layers[targetIdx];
		const bottomLayer = this.layers[targetIdx - 1];

		// Composite top layer onto bottom layer
		for (let r = 0; r < this.rows; r++) {
			for (let c = 0; c < this.cols; c++) {
				const topCell = topLayer.buffer.getCell(c, r);
				if (topCell && topCell.char !== ' ') {
					bottomLayer.buffer.setCell(c, r, { ...topCell });
				}
			}
		}

		// Remove the merged top layer
		this.layers.splice(targetIdx, 1);
		this.activeLayerIndex = targetIdx - 1;
	}

	public toggleVisibility(index: number): void {
		if (index >= 0 && index < this.layers.length) {
			this.layers[index].visible = !this.layers[index].visible;
		}
	}

	public toggleLock(index: number): void {
		if (index >= 0 && index < this.layers.length) {
			this.layers[index].locked = !this.layers[index].locked;
		}
	}

	public renameLayer(index: number, newName: string): void {
		if (index >= 0 && index < this.layers.length && newName.trim()) {
			this.layers[index].name = newName.trim();
		}
	}

	public resizeAll(newCols: number, newRows: number): void {
		this.cols = Math.max(1, newCols);
		this.rows = Math.max(1, newRows);
		for (const layer of this.layers) {
			layer.buffer.resize(this.cols, this.rows);
		}
	}

	/**
	 * Composites all visible layers from bottom to top into a single flattened buffer
	 */
	public getCompositeBuffer(): GridBuffer {
		const composite = new GridBuffer(this.cols, this.rows);

		for (const layer of this.layers) {
			if (!layer.visible) continue;

			for (let r = 0; r < this.rows; r++) {
				for (let c = 0; c < this.cols; c++) {
					const cell = layer.buffer.getCell(c, r);
					if (cell && cell.char !== ' ') {
						composite.setCell(c, r, { ...cell });
					}
				}
			}
		}

		return composite;
	}

	public exportLayerData(): LayerData[] {
		return this.layers.map(layer => ({
			id: layer.id,
			name: layer.name,
			visible: layer.visible,
			locked: layer.locked,
			opacity: layer.opacity,
			content: layer.buffer.toString(false)
		}));
	}

	public loadLayerData(layerDataList: LayerData[], cols: number, rows: number): void {
		if (!layerDataList || layerDataList.length === 0) return;

		this.cols = cols;
		this.rows = rows;
		this.layers = layerDataList.map(ld => {
			const buf = new GridBuffer(cols, rows);
			buf.fromString(ld.content || '');
			return {
				id: ld.id || 'layer-' + Math.random().toString(36).substring(2, 9),
				name: ld.name || 'Layer',
				visible: ld.visible !== false,
				locked: !!ld.locked,
				opacity: ld.opacity || 1.0,
				buffer: buf
			};
		});

		this.activeLayerIndex = Math.max(0, this.layers.length - 1);
	}
}
