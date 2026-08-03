import { BasesViewRegistration, IconName } from "obsidian";
import { IconifyInfo, IconifyJSONIconsData } from "@iconify/types";
import { BasesLeafletViewPlugin } from "./plugin";

export type ViewRegistrationBuilder = (
	plugin: BasesLeafletViewPlugin,
) => [string, BasesViewRegistration];

export type Wiki = [[string]]; // Wiki links take the shape of string[][]
export type Coordinates = `${number}, ${number}`;
export type Hex = `#${string}`;
export type Url = `https:${string}` | `http:${string}`;
export type StringMap = Record<string, unknown>;

export type MarkerObject = {
	mapName?: string;
	coordinates: Coordinates;
	icon?: IconName;
	colour?: Hex;
	minZoom?: number;
	maxZoom?: number;
};

export type MapObject = {
	name?: string;
	image: string | Wiki;
	height?: number;
	minZoom?: number;
	maxZoom?: number;
	defaultZoom?: number;
	zoomDelta?: number;
	scale?: number;
	unit?: string;
	osmMode?: boolean;
	osmTileUrl?: string;
	startCoordinate?: string;
};

export type ReducedIconifyInfo = Pick<IconifyInfo, "name" | "author" | "license">;
// Reconstruct interface as type to avoid "Index signature is missing" error
export type IconifyJSONIconsObject = {
	[Properties in keyof IconifyJSONIconsData]: IconifyJSONIconsData[Properties];
} & { info?: ReducedIconifyInfo };

// Set all properties of MapObject to required except name; osm fields stay optional
export type RequiredMapObject = Omit<Required<MapObject>, "name" | "osmMode" | "osmTileUrl" | "startCoordinate"> & {
	name?: string;
	osmMode?: boolean;
	osmTileUrl?: string;
	startCoordinate?: string;
};

export type ValidatorFunction<T> = (value: unknown) => value is T;

export type Schema<T extends keyof StringMap> = Record<
	T,
	{ validator: ValidatorFunction<unknown>; required?: boolean }
>;

export abstract class Manager {
	constructor(public plugin: BasesLeafletViewPlugin) {}
	abstract load(): Promise<void>;
	abstract unload(): void;
}

export interface BasesLeafletViewSettings {
	enableMeasureTool: boolean;
	enableCopyTool: boolean;
	iconData: IconifyJSONIconsObject[];
	defaultOsm: string;
	tileTheme: "auto" | "light" | "dark";
}

export enum MarkerModalMode {
	Add = "add",
	Edit = "edit",
}
