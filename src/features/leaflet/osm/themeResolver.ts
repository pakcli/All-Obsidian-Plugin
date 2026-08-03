import { OsmConstants, TileTheme } from "./constants";

export function detectObsidianTheme(): "light" | "dark" {
	if (typeof document === "undefined") return "light";
	return document.body.classList.contains("theme-dark") ? "dark" : "light";
}

export function resolveTileUrl(
	explicitUrl: string | undefined,
	fallbackUrl: string | undefined,
	tileTheme: TileTheme,
	detectedTheme: "light" | "dark" = detectObsidianTheme(),
): string {
	if (explicitUrl && explicitUrl.length > 0) return explicitUrl;
	if (fallbackUrl && fallbackUrl.length > 0) return fallbackUrl;

	const effectiveTheme = tileTheme === "auto" ? detectedTheme : tileTheme;
	return OsmConstants.tiles[effectiveTheme];
}
