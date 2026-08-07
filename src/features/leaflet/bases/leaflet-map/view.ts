/* eslint-disable obsidianmd/no-unsupported-api */
import { BasesAllOptions, BasesView, BasesViewConfig, QueryController } from "obsidian";
import { Constants as C } from "@plugin/constants";
import { t } from "@plugin/i18n/locale";
import { BasesLeafletViewPlugin } from "@plugin/plugin";
import { MapObject, ViewRegistrationBuilder } from "@plugin/types";
import { clamp } from "@plugin/util";
import { SchemaValidator } from "@plugin/validation/schemaValidators";
import { MapManager } from "./map";
import { MarkerManager } from "./marker";

function parseZoom(value: unknown, min: number, max: number): number | undefined {
	const num = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
	if (!isFinite(num) || isNaN(num)) return undefined;
	return clamp(num, min, max);
}

export const LeafletMapViewRegistrationBuilder: ViewRegistrationBuilder = (
	plugin: BasesLeafletViewPlugin,
) => [
	C.view.type,
	{
		name: t("view.name"),
		icon: C.view.icon,
		factory: (controller, parentEl) => new LeafletMapView(controller, parentEl, plugin),
		options: (config) => LeafletMapView.getViewOptions(config),
	},
];

class LeafletMapView extends BasesView {
	type = C.view.type;
	private plugin: BasesLeafletViewPlugin;
	private containerEl: HTMLElement;
	private mapSettings: MapObject | undefined;

	// Managers — created lazily on first data update, because CRS is decided from
	// config at map init and this.config isn't safe to read in the constructor.
	private mapManager: MapManager | undefined;
	private markerManager: MarkerManager | undefined;

	constructor(controller: QueryController, parentEl: HTMLElement, plugin: BasesLeafletViewPlugin) {
		super(controller);
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv("bases-leaflet-map-container");
	}

	onDataUpdated(): void {
		void this.updateData();
	}

	override unload(): void {
		this.markerManager?.unload();
		this.mapManager?.unload();
	}

	private ensureManagers(): void {
		if (this.mapManager) return;
		const osmMode = !!this.config.get(C.view.obsidianIdentifiers.osmMode);
		this.mapManager = new MapManager(this.plugin, this.containerEl, {
			osmMode,
			setConfig: (key, value) => this.config.set(key, value),
		});
		this.markerManager = new MarkerManager(
			this.app,
			this.mapManager.leafletMap,
			this.mapManager.markerLayer,
		);
	}

	private async updateData(): Promise<void> {
		this.ensureManagers();
		if (!this.mapManager || !this.markerManager) return;
		// Markers must render after the map has a center/zoom or getBounds() returns
		// garbage and the world-copy offset computation collapses to a single copy.
		await this.updateMapSettings();
		this.markerManager.updateMarkers(this.data);
	}

	private async updateMapSettings(): Promise<void> {
		if (this.mapSettings) return;
		if (!this.mapManager || !this.markerManager) return;

		const settings = {
			name: this.config.get(C.view.obsidianIdentifiers.mapName),
			image: this.config.get(C.view.obsidianIdentifiers.image),
			height: this.config.get(C.view.obsidianIdentifiers.height),
			minZoom: this.config.get(C.view.obsidianIdentifiers.minZoom),
			maxZoom: this.config.get(C.view.obsidianIdentifiers.maxZoom),
			defaultZoom: this.config.get(C.view.obsidianIdentifiers.defaultZoom),
			zoomDelta: this.config.get(C.view.obsidianIdentifiers.zoomDelta),
			scale: this.config.get(C.view.obsidianIdentifiers.scale),
			unit: this.config.get(C.view.obsidianIdentifiers.unit),
			osmMode: this.config.get(C.view.obsidianIdentifiers.osmMode),
			osmTileUrl: this.config.get(C.view.obsidianIdentifiers.osmTileUrl),
			startCoordinate: this.config.get(C.view.obsidianIdentifiers.startCoordinate),
		};

		// Obsidian view options doesn't have a text based number input and type slider is impractical
		// If view options is used we always get a string instead of number, so we fix that
		if (typeof settings.scale === "string") settings.scale = parseFloat(settings.scale);

		// Zoom fields are exposed as text inputs so we always parse + clamp them here.
		const zoomRange = C.view.config.zoom.base;
		const deltaRange = C.view.config.zoom.delta;
		settings.minZoom = parseZoom(settings.minZoom, zoomRange.min, zoomRange.max);
		settings.maxZoom = parseZoom(settings.maxZoom, zoomRange.min, zoomRange.max);
		settings.defaultZoom = parseZoom(settings.defaultZoom, zoomRange.min, zoomRange.max);
		settings.zoomDelta = parseZoom(settings.zoomDelta, deltaRange.min, deltaRange.max);

		if (!SchemaValidator.map(settings)) return;

		const minZoom = settings.minZoom ?? C.map.default.minZoom;
		const maxZoom = Math.max(settings.maxZoom ?? C.map.default.maxZoom, minZoom);

		this.markerManager.updateSettings(settings.name, minZoom);
		await this.mapManager.updateSettings({
			...settings,
			height: settings.height ?? C.map.default.height,
			minZoom,
			maxZoom,
			defaultZoom: clamp(settings.defaultZoom ?? minZoom, minZoom, maxZoom),
			zoomDelta: settings.zoomDelta ?? C.map.default.zoomDelta,
			scale: settings.scale ?? C.map.default.scale,
			unit: settings.unit ?? C.map.default.unit,
			osmMode: settings.osmMode,
			osmTileUrl: settings.osmTileUrl,
			startCoordinate: typeof settings.startCoordinate === "string"
				? settings.startCoordinate
				: undefined,
		});
	}

	static getViewOptions(config: BasesViewConfig): BasesAllOptions[] {
		const isOsm = () => !!config.get(C.view.obsidianIdentifiers.osmMode);
		return [
			{
				displayName: t("view.options.mapname.title"),
				type: "text",
				key: C.view.obsidianIdentifiers.mapName,
				placeholder: t("view.options.mapname.placeholder"),
			},
			{
				displayName: t("view.options.height"),
				type: "slider",
				key: C.view.obsidianIdentifiers.height,
				default: C.map.default.height,
				...C.view.config.height,
			},
			{
				displayName: t("view.options.osm.mode.title"),
				type: "toggle",
				key: C.view.obsidianIdentifiers.osmMode,
				default: false,
			},
			{
				displayName: t("view.options.image"),
				type: "file",
				key: C.view.obsidianIdentifiers.image,
				filter: (file) => (C.map.imageTypes as readonly string[]).includes(file.extension),
				shouldHide: isOsm,
			},
			{
				displayName: t("view.options.osm.tileUrl.title"),
				type: "text",
				key: C.view.obsidianIdentifiers.osmTileUrl,
				placeholder: t("view.options.osm.tileUrl.placeholder"),
				shouldHide: () => !isOsm(),
			},
			{
				displayName: t("view.options.osm.startCoordinate.title"),
				type: "text",
				key: C.view.obsidianIdentifiers.startCoordinate,
				placeholder: "0.00000, 0.00000",
				shouldHide: () => !isOsm(),
			},
			{
				displayName: t("view.options.zoom.header"),
				type: "group",
				items: [
					{
						displayName: t("view.options.zoom.default"),
						type: "text",
						key: C.view.obsidianIdentifiers.defaultZoom,
						default: C.map.default.minZoom.toString(),
						placeholder: `${C.view.config.zoom.base.min} to ${C.view.config.zoom.base.max}`,
					},
					{
						displayName: t("view.options.zoom.min"),
						type: "text",
						key: C.view.obsidianIdentifiers.minZoom,
						default: C.map.default.minZoom.toString(),
						placeholder: `${C.view.config.zoom.base.min} to ${C.view.config.zoom.base.max}`,
					},
					{
						displayName: t("view.options.zoom.max"),
						type: "text",
						key: C.view.obsidianIdentifiers.maxZoom,
						default: C.map.default.maxZoom.toString(),
						placeholder: `${C.view.config.zoom.base.min} to ${C.view.config.zoom.base.max}`,
					},
					{
						displayName: t("view.options.zoom.delta"),
						type: "text",
						key: C.view.obsidianIdentifiers.zoomDelta,
						default: C.map.default.zoomDelta.toString(),
						placeholder: `${C.view.config.zoom.delta.min} to ${C.view.config.zoom.delta.max}`,
					},
				],
			},
			{
				displayName: t("view.options.measure.header"),
				type: "group",
				items: [
					{
						displayName: t("view.options.measure.scale"),
						type: "text",
						key: C.view.obsidianIdentifiers.scale,
						default: C.map.default.scale.toString(),
					},
					{
						displayName: t("view.options.measure.unit.title"),
						type: "text",
						key: C.view.obsidianIdentifiers.unit,
						placeholder: t("view.options.measure.unit.placeholder"),
					},
				],
			},
		];
	}
}