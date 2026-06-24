import { App, TFile, normalizePath } from 'obsidian';
import { AssetRouterSettings, FolderRule } from './types';
import { sanitizeFilename, ensureFolderExists, getUniqueFilePath } from './utils/helpers';

export class AssetRouter {
	private app: App;
	private getSettings: () => AssetRouterSettings;
	private isMovingFile = false; // Guard against recursive loops during move

	constructor(app: App, getSettings: () => AssetRouterSettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	/**
	 * Core routing logic for newly added or scanned assets.
	 * Returns true if the file was routed, false otherwise.
	 */
	async handleFileRoute(file: TFile, overrideActiveNote?: TFile): Promise<boolean> {
		if (this.isMovingFile) return false;

		const settings = this.getSettings();
		const ext = file.extension.toLowerCase();
		if (ext === 'md' || !settings.assetExtensions.includes(ext)) {
			return false;
		}

		// Locate target note
		const activeFile = overrideActiveNote || this.app.workspace.getActiveFile();
		if (!activeFile) return false;

		// Find matching rule for the note's parent path
		const noteParentPath = normalizePath(activeFile.parent ? activeFile.parent.path : "");
		const rule = this.findMatchingRule(noteParentPath);

		let targetFolderPath = '';
		let targetFileName = '';
		let useTitle = false;

		if (rule) {
			// NESTED MODE (Captain Folder)
			const captainPath = normalizePath(rule.path);
			targetFolderPath = normalizePath(captainPath === "" || captainPath === "." ? "assets" : `${captainPath}/assets`);

			// Resolve if we should use the note title property
			if (rule.useNoteTitle === 'always') {
				useTitle = true;
			} else if (rule.useNoteTitle === 'never') {
				useTitle = false;
			} else {
				useTitle = settings.useNoteTitleGlobalNested;
			}

			// Resolve Note Identifier
			const noteIdentifier = this.resolveNoteIdentifier(activeFile, useTitle);

			// Compute relative subfolder path from Captain Folder to note
			let relativePrefix = '';
			if (captainPath === "") {
				if (noteParentPath !== "") {
					relativePrefix = noteParentPath.split('/').join(settings.delimiter);
				}
			} else if (noteParentPath !== captainPath && noteParentPath.startsWith(captainPath + '/')) {
				const relativeSubPath = noteParentPath.substring(captainPath.length + 1);
				relativePrefix = relativeSubPath.split('/').join(settings.delimiter);
			}

			// Formulate filename
			if (relativePrefix) {
				targetFileName = `${relativePrefix}${settings.delimiter}${noteIdentifier}${settings.delimiter}${file.name}`;
			} else {
				if (useTitle) {
					targetFileName = `${noteIdentifier}${settings.delimiter}${file.name}`;
				} else {
					targetFileName = file.name;
				}
			}
		} else {
			// CENTRALIZED MODE (Default)
			if (!settings.centralAssetFolderEnabled) {
				return false; // Centralized routing is disabled, and no Nested rule matched
			}

			targetFolderPath = normalizePath(settings.centralAssetFolder);
			useTitle = settings.useNoteTitleGlobalCentral;

			// Resolve Note Identifier
			const noteIdentifier = this.resolveNoteIdentifier(activeFile, useTitle);

			// Compute prefix from note parent folder
			let folderPrefix = '';
			if (noteParentPath && noteParentPath !== '.' && noteParentPath !== '/') {
				folderPrefix = noteParentPath.split('/').join(settings.delimiter);
			}

			// Formulate filename
			if (folderPrefix) {
				targetFileName = `${folderPrefix}${settings.delimiter}${noteIdentifier}${settings.delimiter}${file.name}`;
			} else {
				targetFileName = `${noteIdentifier}${settings.delimiter}${file.name}`;
			}
		}

		// Prevent infinite loops or routing a file that is already exactly where it belongs
		const targetPath = normalizePath(`${targetFolderPath}/${targetFileName}`);
		if (file.path === targetPath) {
			return false;
		}

		// Guard: If the file is already inside targetFolderPath, and its name already starts with relative prefix + note name,
		// or matches targetFileName, avoid duplicating it.
		if (file.path.startsWith(targetFolderPath + '/')) {
			if (file.name === targetFileName) {
				return false;
			}
		}

		try {
			this.isMovingFile = true;
			await ensureFolderExists(this.app, targetFolderPath);
			const uniqueTargetPath = getUniqueFilePath(this.app, targetPath);
			await this.app.fileManager.renameFile(file, uniqueTargetPath);
			return true;
		} catch (err) {
			console.error('[Asset Router] Failed to route file:', err);
			return false;
		} finally {
			this.isMovingFile = false;
		}
	}

	/**
	 * Finds the most specific enabled rule matching the given note path.
	 */
	findMatchingRule(notePath: string): FolderRule | null {
		const settings = this.getSettings();
		const activeRules = settings.rules.filter(r => r.enabled);
		const matches: FolderRule[] = [];

		const normalizedNotePath = normalizePath(notePath);

		for (const rule of activeRules) {
			const normalizedRulePath = normalizePath(rule.path);

			if (rule.includeChildren) {
				if (normalizedRulePath === "") {
					// Root rule with includeChildren always matches
					matches.push(rule);
				} else if (normalizedNotePath === normalizedRulePath || normalizedNotePath.startsWith(normalizedRulePath + '/')) {
					matches.push(rule);
				}
			} else {
				if (normalizedNotePath === normalizedRulePath) {
					matches.push(rule);
				}
			}
		}

		if (matches.length === 0) return null;

		// Sort by path length descending (most specific first)
		matches.sort((a, b) => b.path.length - a.path.length);
		return matches[0];
	}

	/**
	 * Resolves note identifier: either YAML frontmatter title or file basename.
	 */
	private resolveNoteIdentifier(noteFile: TFile, useTitle: boolean): string {
		const settings = this.getSettings();
		if (useTitle) {
			const fileCache = this.app.metadataCache.getFileCache(noteFile);
			const title = fileCache?.frontmatter?.title;
			if (title && typeof title === 'string' && title.trim() !== '') {
				return sanitizeFilename(title.trim(), settings.delimiter);
			}
		}
		return sanitizeFilename(noteFile.basename, settings.delimiter);
	}
}
