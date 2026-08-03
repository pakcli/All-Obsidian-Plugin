export const OsmConstants = {
	tiles: {
		light: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		dark: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
	},
	attribution:
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	zoom: {
		min: 0,
		max: 19,
	},
	startCoordinate: "startCoordinate",
} as const;

export type TileTheme = "auto" | "light" | "dark";
