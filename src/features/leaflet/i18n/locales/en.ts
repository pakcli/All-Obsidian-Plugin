import { MarkerModalMode } from "@plugin/types";

export default {
	settings: {
		tools: {
			title: "Map tools",
			measure: {
				title: "Enable measure tool",
				description: "Enable tool that allows you to measure distances",
			},
			copy: {
				title: "Enable copy tool",
				description: "Enable tool that allows you to copy coordinated to your clipboard",
			},
		},
		osm: {
			title: "OSM tile layer",
			defaultUrl: {
				title: "Default tile URL",
				description:
					"Default tile URL used when a view has OSM mode enabled but no osmTileUrl set. Leave empty to use the CARTO theme fallback.",
				placeholder: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
			},
			tileTheme: {
				title: "Tile theme",
				description:
					"Which CARTO theme to use when no custom URL is set. Auto follows the active Obsidian theme.",
				options: {
					auto: "Auto",
					light: "Light",
					dark: "Dark",
				},
			},
		},
		icons: {
			title: "Additional icon sets",
			add: {
				title: "Add iconify icon set",
				description: {
					start: "Additional",
					previewLink: "Iconify icon sets",
					middle: "can be downloaded as .json files at the",
					githubLink: "Iconify GitHub repository",
					end: "",
					warning: "Adding too many icons can negatively impact the performance of your device",
				},
				buttonText: "Add iconset",
				error: "There was an error loading your icon set(s)",
			},
		},
	},
	view: {
		name: "Leaflet Map",
		options: {
			image: "Image",
			height: "Embedded height",
			mapname: {
				title: "Map name",
				placeholder: "Optional",
			},
			zoom: {
				header: "Zoom",
				default: "Default zoom",
				min: "Minimum zoom",
				max: "Maximum zoom",
				delta: "Zoom stepsize",
			},
			measure: {
				header: "Measure",
				scale: "Scale",
				unit: {
					title: "Unit",
					placeholder: "Unit of measurement",
				},
			},
			osm: {
				header: "OSM tiles",
				mode: {
					title: "Use OSM",
					description: "Render geographic OSM tiles instead of the image overlay",
				},
				tileUrl: {
					title: "Tile URL",
					placeholder: "Leave empty to use plugin default",
				},
				startCoordinate: {
        			title: "Start coordinate",
    			},
			},
		},
	},
	modal: {
		title: {
			[MarkerModalMode.Add]: "Add marker",
			[MarkerModalMode.Edit]: "Edit marker",
		},
		submit: {
			[MarkerModalMode.Add]: "Create marker",
			[MarkerModalMode.Edit]: "Submit changes",
		},
		mapName: {
			title: "Map name",
			description:
				"Optional. Name of the map this marker is specific to. Useful if you want to add this note as a marker to multiple different maps.",
		},
		coordinates: {
			title: "Coordinates",
			description: "Required. Marker coordinates on the map.",
			error: {
				required: "Value is required",
				invalid: "Value not a valid coordinate",
			},
		},
		icon: {
			title: "Icon",
			description: "Optional. The marker icon, defaults to a dot if left empty.",
			placeholder: "Search for an icon",
		},
		colour: {
			title: "Colour",
			description:
				"The marker colour. The dropdown menu has some default values, on custom values it shows empty.",
			predefined: {
				green: "green",
				lime: "lime",
				yellow: "yellow",
				pink: "pink",
				blue: "blue",
				lightblue: "lightblue",
				brown: "brown",
				orange: "orange",
				red: "red",
				purple: "purple",
			},
		},
		minZoom: {
			title: "Minimal zoom",
			description: "Optional. Minimal zoom from which the marker becomes visible.",
		},
		maxZoom: {
			title: "Maximum zoom",
			description: "Optional. Maximum zoom up to which the marker stays visible.",
		},
	},
	map: {
		controls: {
			measure: "Measure",
			pan: {
				label: "Pan",
			},
			copy: {
				label: "Copy coordinates",
				notice: {
					success: "Coordinates copied to clipboard",
					failure: "Failed copying coordinates to clipboard",
				},
			},
			captureView: {
				label: "Capture start view",
				notice: {
					success: "Start view coordinates copied to clipboard",
					failure: "Failed copying start view coordinates to clipboard",
				},
			},
			captureZoom: {
				label: "Capture current zoom",
				notice: {
					success: "Current zoom copied to clipboard",
					failure: "Failed copying current zoom to clipboard",
				},
			},
			setStartView: {
				label: "Set current view as start view",
				notice: {
					success: "Start view and zoom saved to view config",
					failure: "Failed saving start view to view config",
				},
			},
		},
	},
	marker: {
		name: "Marker",
	},
};
