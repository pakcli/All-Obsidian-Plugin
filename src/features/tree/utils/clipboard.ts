/**
 * Copy text to system clipboard
 * @returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
		const electronClipboard = typeof window !== 'undefined' && (window as any).require ? (window as any).require('electron')?.clipboard : null;
		if (electronClipboard?.writeText) {
			electronClipboard.writeText(text);
			return true;
		}
		return false;
	} catch {
		return false;
	}
}
