import { TileLayer, tileLayer } from "leaflet";
import { OsmConstants } from "./constants";

export interface OsmTileLayerOptions {
	url: string;
	minZoom?: number;
	maxZoom?: number;
}

export function createOsmTileLayer(options: OsmTileLayerOptions): TileLayer {
	return tileLayer(options.url, {
		attribution: OsmConstants.attribution,
		minZoom: options.minZoom ?? OsmConstants.zoom.min,
		maxZoom: options.maxZoom ?? OsmConstants.zoom.max,
		// Repeat the tile grid horizontally so panning across the antimeridian
		// keeps rendering tiles instead of bleeding into an empty background.
		noWrap: false,
	});
}
