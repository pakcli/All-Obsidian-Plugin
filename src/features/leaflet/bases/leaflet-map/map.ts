import { CRS, ImageOverlay, imageOverlay, LayerGroup, layerGroup, Map, map, TileLayer } from "leaflet";
import { EventRef } from "obsidian";
import { Constants as C } from "@plugin/constants";
import { OsmConstants } from "@plugin/osm/constants";
import { createOsmTileLayer } from "@plugin/osm/tileLayerFactory";
import { resolveTileUrl } from "@plugin/osm/themeResolver";
import { BasesLeafletViewPlugin } from "@plugin/plugin";
import type { RequiredMapObject, Wiki } from "@plugin/types";
import { clamp } from "@plugin/util";
import { ControlContainer } from "./control/container";
import { SetConfigCallback } from "./control/subControl";
import { ImageLoader } from "./imageLoader";

export interface MapManagerOptions {
	osmMode?: boolean;
	setConfig?: SetConfigCallback;
}

export class MapManager {
	private mapEl: HTMLElement;
	private _leafletMap: Map;
	private settings: RequiredMapObject | undefined = undefined;
	private plugin: BasesLeafletViewPlugin;

	// Layers
	private _markerLayer: LayerGroup;
	private imageOverlay: ImageOverlay | undefined;
	private osmTileLayer: TileLayer | undefined;
	private activeTileUrl: string | undefined;

	// Managers
	private imageLoader: ImageLoader;
	private controls: ControlContainer | undefined;
	private themeChangeEventRef: EventRef | undefined;

	constructor(
		plugin: BasesLeafletViewPlugin,
		containerEl: HTMLElement,
		options: MapManagerOptions = {},
	) {
		this.plugin = plugin;
		this.mapEl = containerEl.createDiv("bases-leaflet-map");
		this.imageLoader = new ImageLoader(plugin.app);

		// Map initialisation — CRS.Simple for image mode, EPSG3857 for OSM mode.
		// worldCopyJump snaps the view back at the ±180° seam when the user pans into an
		// adjacent world copy, so a single marker per entry appears to exist in every copy
		// without cloning. Image mode keeps it off.
		this._markerLayer = layerGroup();
		this._leafletMap = map(this.mapEl, {
			crs: options.osmMode ? CRS.EPSG3857 : CRS.Simple,
			zoomSnap: C.map.default.zoomSnap,
			worldCopyJump: !!options.osmMode,
			layers: [this._markerLayer],
		});

		if (
			plugin.settingsManager.settings.enableMeasureTool ||
			plugin.settingsManager.settings.enableCopyTool ||
			options.setConfig
		) {
			this.controls = new ControlContainer(plugin.settingsManager.settings, options.setConfig);
			this.controls.addTo(this._leafletMap);
		}

		this.themeChangeEventRef = plugin.app.workspace.on("css-change", () => {
			if (this.settings?.osmMode) this.updateOsmTileLayer(this.settings);
		});
	}

	get leafletMap(): Map {
		return this._leafletMap;
	}

	get markerLayer(): LayerGroup {
		return this._markerLayer;
	}

	unload(): void {
		if (this.themeChangeEventRef) {
			this.plugin.app.workspace.offref(this.themeChangeEventRef);
			this.themeChangeEventRef = undefined;
		}
		this.controls?.onRemove(this._leafletMap);
		this._leafletMap.clearAllEventListeners();
		this._leafletMap.remove();
	}

	async updateSettings(settings: RequiredMapObject): Promise<void> {
		if (settings.osmMode) settings = this.clampOsmZoom(settings);

		this.updateCss(settings);
		this._leafletMap.invalidateSize();

		if (settings.osmMode) {
			this.updateOsmTileLayer(settings);
		} else {
			await this.updateImageOverlay(settings.image);
		}

		this.updateZoom(settings);
		this.controls?.updateSettings(settings);

		// Delay lets the DOM finish layout before Leaflet remeasures the container.
		setTimeout(() => this._leafletMap.invalidateSize(), 100);

		this.settings = settings;
	}

	// OSM raster tiles only exist at integer zoom 0..19; image-map defaults (negative zoom, etc.)
	// produce a gray map. Clamp user values into the valid OSM range here rather than at the
	// view layer so image mode is unaffected.
	private clampOsmZoom(settings: RequiredMapObject): RequiredMapObject {
		const minZoom = Math.max(settings.minZoom, OsmConstants.zoom.min);
		const maxZoom = Math.max(Math.min(settings.maxZoom, OsmConstants.zoom.max), minZoom);
		return {
			...settings,
			minZoom,
			maxZoom,
			defaultZoom: clamp(settings.defaultZoom, minZoom, maxZoom),
		};
	}

	private updateOsmTileLayer(settings: RequiredMapObject): void {
		const pluginSettings = this.plugin.settingsManager.settings;
		const url = resolveTileUrl(
			settings.osmTileUrl,
			pluginSettings.defaultOsm,
			pluginSettings.tileTheme,
		);

		if (this.activeTileUrl === url && this.osmTileLayer) return;

		const isFirstTileLayer = !this.osmTileLayer;

		if (this.osmTileLayer) this._leafletMap.removeLayer(this.osmTileLayer);
		if (this.imageOverlay) {
			this._leafletMap.removeLayer(this.imageOverlay);
			this.imageOverlay = undefined;
		}

		// Image mode sets maxBounds to the image extent; that restriction would stop OSM
		// from panning/wrapping horizontally, so drop it before seeding the OSM view.
		this._leafletMap.setMaxBounds(undefined as never);

		// Seed the view BEFORE adding the tile layer so the layer computes its initial tile
		// range from a real center/zoom rather than Leaflet's unloaded default.
		if (isFirstTileLayer) {
			const center = this.parseStartCoordinate(settings.startCoordinate);
			this._leafletMap.setView(center, settings.defaultZoom);
		}

		this.osmTileLayer = createOsmTileLayer({
			url,
			minZoom: settings.minZoom,
			maxZoom: settings.maxZoom,
		});
		this._leafletMap.addLayer(this.osmTileLayer);
		this.activeTileUrl = url;
	}
	

	private async updateImageOverlay(image: string | Wiki): Promise<void> {
		if (this.settings?.image === image) return;

		const imageData = await this.imageLoader.getImageData(image);
		if (!imageData) return;

		if (this.imageOverlay) this._leafletMap.removeLayer(this.imageOverlay);
		this.imageOverlay = imageOverlay(imageData.url, imageData.bounds);

		this._leafletMap
			.addLayer(this.imageOverlay)
			.setMaxBounds(imageData.bounds)
			.fitBounds(imageData.bounds);
	}

	private updateZoom(settings: RequiredMapObject): void {
		this._leafletMap.setMinZoom(settings.minZoom);
		this._leafletMap.setMaxZoom(settings.maxZoom);

		this._leafletMap.setZoom(settings.defaultZoom);

		// No clue why there are no setting functions for this but mehh, this works
		this._leafletMap.options = {
			...this._leafletMap.options,
			zoomDelta: settings.zoomDelta,
			// wheelPxPerZoomLevel defaults to 60, but the actual amount is dependent on the user's scroll device
			// This is therefore just an approximation based on the default value
			wheelPxPerZoomLevel: 60 / settings.zoomDelta,
		};
	}

	private updateCss(settings: RequiredMapObject): void {
    this.mapEl.style.height = `${settings.height.toFixed(0)}px`;
    this.mapEl.style.width = "100%";
}

	private parseStartCoordinate(coord: string | undefined): [number, number] {
    if (!coord) return [0, 0];
    const parts = coord.replace(/\s/g, "").split(",").map(parseFloat);
    if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
        return [parts[0]!, parts[1]!];
    }
    return [0, 0];
	}	
}
