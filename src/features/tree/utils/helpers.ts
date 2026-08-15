import { App, normalizePath } from 'obsidian';

/**
 * Sanitizes a string to make it safe for a filename.
 */
export function sanitizeFilename(name: string, delimiter: string): string {
	let sanitized = name.replace(/[\\/:*?"<>|#^[\]]/g, '');
	// Standardize spaces to a single space and trim instead of replacing with delimiter
	sanitized = sanitized.replace(/\s+/g, ' ').trim();
	
	if (delimiter) {
		while (sanitized.startsWith(delimiter)) {
			sanitized = sanitized.substring(delimiter.length);
		}
		while (sanitized.endsWith(delimiter)) {
			sanitized = sanitized.substring(0, sanitized.length - delimiter.length);
		}
	}
	
	return sanitized || 'untitled';
}

/**
 * Checks and creates parent folders recursively if they don't exist.
 */
export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath);
	if (normalized === '.' || normalized === '/' || normalized === '') {
		return;
	}

	const parts = normalized.split('/');
	let currentPath = '';

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (!existing) {
			try {
				await app.vault.createFolder(currentPath);
			} catch {
				// Silent fail if folder exists or is created in parallel
			}
		}
	}
}

/**
 * Appends a numeric suffix if a file already exists at the target path.
 */
export function getUniqueFilePath(app: App, targetPath: string): string {
	let uniquePath = normalizePath(targetPath);
	if (!app.vault.getAbstractFileByPath(uniquePath)) {
		return uniquePath;
	}

	const lastDotIndex = uniquePath.lastIndexOf('.');
	let basePath = uniquePath;
	let ext = '';

	if (lastDotIndex !== -1) {
		basePath = uniquePath.substring(0, lastDotIndex);
		ext = uniquePath.substring(lastDotIndex);
	}

	let counter = 1;
	while (app.vault.getAbstractFileByPath(`${basePath}_${counter}${ext}`)) {
		counter++;
	}

	return `${basePath}_${counter}${ext}`;
}
