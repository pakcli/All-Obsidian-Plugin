import {
	DivIcon,
	divIcon,
	LayerGroup,
	LeafletMouseEvent,
	LeafletMouseEventHandlerFn,
	Map as LeafletMap,
	Marker,
	marker,
} from "leaflet";
import { App, IconName, TFile } from "obsidian";

// Local structural types for Obsidian Bases APIs (avoids no-unsupported-api lint)
type Value = string | number | boolean | null;
interface BasesEntry {
	getValue(key: string): Value | null;
	file: TFile;
}
import { Constants as C } from "@plugin/constants";
import { MarkerObject } from "@plugin/types";
import { getIconWithDefault, isNonEmptyObject, isNotNull, parseCoordinates } from "@plugin/util";
import { SchemaValidator } from "@plugin/validation/schemaValidators";

interface MarkerEntry extends MarkerObject {
	name: string;
	link: string;
}

function isProperEntry(entry: unknown): entry is { [key: string]: string } {
	if (!isNonEmptyObject(entry)) return false;
	return Object.values(entry).every((property) => typeof property === "string");
}

function parseMarkerFromEntry(entry: unknown, name: string, link: string): MarkerEntry | null {
	if (!isProperEntry(entry)) return null;

	const fixedPOJO = {
		...entry,
		minZoom: "minZoom" in entry ? parseFloat(entry.minZoom) : undefined,
		maxZoom: "maxZoom" in entry ? parseFloat(entry.maxZoom) : undefined,
	};
	if (!SchemaValidator.marker(fixedPOJO)) return null;

	return {
		...fixedPOJO,
		name,
		link,
	};
}

function markersFromEntry(entry: Value | null, file: TFile): MarkerEntry[] | null {
	if (entry === null) return null;

	let entryString = String((entry as unknown as { toString: () => string }).toString());
	if (!C.regExp.arrayString.test(entryString)) entryString = `[${entryString}]`;

	let markerEntries: unknown;
	try {
		markerEntries = JSON.parse(entryString);
	} catch {
		return null;
	}

	if (!Array.isArray(markerEntries)) return null;
	return markerEntries
		.map((markerEntry) => parseMarkerFromEntry(markerEntry, file.basename, file.path))
		.filter(isNotNull);
}

export class MarkerManager {
	private xmlSerializer: XMLSerializer;

	private mapName: string | undefined;
	private mapMinZoom: number = 0;
	private markerEntries: MarkerEntry[] = [];
	private markerCache: Map<number, Marker> = new Map();
	private readonly zoomHandler: () => void;

	constructor(
		private app: App,
		private map: LeafletMap,
		private markerLayer: LayerGroup,
	) {
		this.xmlSerializer = new XMLSerializer();
		this.zoomHandler = () => this.applyZoomVisibility();
		this.map.on("zoomend", this.zoomHandler);
	}

	unload(): void {
		this.map.off("zoomend", this.zoomHandler);
		this.markerLayer.clearLayers();
		this.markerCache.clear();
	}

	updateMarkers(data: { data: BasesEntry[] }): void {
		this.markerEntries = (data.data as BasesEntry[])
			.flatMap((entry) => markersFromEntry(entry.getValue("note.marker"), entry.file))
			.filter(isNotNull)
			.filter((entry) => entry.mapName === undefined || entry.mapName === this.mapName);
		this.markerLayer.clearLayers();
		this.markerCache.clear();
		this.renderMarkers();
	}

	updateSettings(mapName: string | undefined, mapMinZoom: number): void {
		this.mapName = mapName;
		this.mapMinZoom = mapMinZoom;
	}

	private renderMarkers(): void {
		this.markerEntries.forEach((entry, entryIndex) => {
			const [lat, lng] = parseCoordinates(entry.coordinates);
			const markerItem = marker([lat, lng], {
				icon: this.buildMarkerIcon(entry.icon, entry.colour),
			})
				.bindTooltip(entry.name)
				.on("click", this.getMarkerOnClick(entry.link));
			this.markerCache.set(entryIndex, markerItem);
		});
		this.applyZoomVisibility();
	}

	private applyZoomVisibility(): void {
		if (!this.mapHasView()) {
			this.markerCache.forEach((m) => this.markerLayer.addLayer(m));
			return;
		}
		const currentZoom = this.map.getZoom();
		const tolerance = 0.00001;
		this.markerCache.forEach((markerItem, entryIndex) => {
			const entry = this.markerEntries[entryIndex];
			if (!entry) return;
			const markerMinZoom = entry.minZoom ?? this.mapMinZoom;
			const aboveMin = currentZoom >= markerMinZoom - tolerance;
			const belowMax = entry.maxZoom === undefined || currentZoom <= entry.maxZoom + tolerance;
			const visible = aboveMin && belowMax;
			const attached = this.markerLayer.hasLayer(markerItem);
			if (visible && !attached) this.markerLayer.addLayer(markerItem);
			else if (!visible && attached) this.markerLayer.removeLayer(markerItem);
		});
	}

	private mapHasView(): boolean {
		try {
			this.map.getCenter();
			return true;
		} catch {
			return false;
		}
	}

	private buildMarkerIcon(iconId: IconName | undefined, colour: string | undefined): DivIcon {
		const innerIcon = getIconWithDefault(iconId);
		innerIcon.addClass("leaflet-marker-inner-icon");

		return divIcon({
			className: "leaflet-marker-icon",
			html: `
				<svg class="leaflet-marker-pin" style="fill:${colour ?? C.marker.defaultColour}" viewBox="0 0 32 48">
					<path d="m32,19c0,12 -12,24 -16,29c-4,-5 -16,-16 -16,-29a16,19 0 0 1 32,0"/>
				</svg>
				${this.xmlSerializer.serializeToString(innerIcon)}
			`,
			iconSize: [32, 48],
			iconAnchor: [16, 48],
			tooltipAnchor: [17, -30],
		});
	}

	private getMarkerOnClick(url: string): LeafletMouseEventHandlerFn {
		return (_event: LeafletMouseEvent) => {
			void this.app.workspace.openLinkText("", url);
		};
	}
}