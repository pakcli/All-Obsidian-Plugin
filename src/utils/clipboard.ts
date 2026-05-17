// Electron clipboard (may not be available in all environments)
let electronClipboard: { writeText: (text: string) => void } | null = null;

try {
	electronClipboard = require("electron").clipboard;
} catch (_) {
	// Electron not available, will fall back to navigator.clipboard
}

/**
 * Copy text to system clipboard
 * @returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (electronClipboard) {
			electronClipboard.writeText(text);
		} else {
			await navigator.clipboard.writeText(text);
		}
		return true;
	} catch {
		return false;
	}
}
