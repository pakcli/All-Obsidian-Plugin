import { App, TFile, normalizePath, Notice, MarkdownView, Plugin } from 'obsidian';
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
	 * Registers event listeners for asset routing.
	 */
	registerEvents(plugin: Plugin) {
		plugin.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (file instanceof TFile) {
					const activeNote = this.app.workspace.getActiveFile();
					if (activeNote) {
						const isPasted = file.name.startsWith('Pasted image');
						const maxWait = isPasted ? 2000 : 500;

						const resolved = await this.waitForMetadataCache(activeNote, file, maxWait);

						const oldName = file.name;
						const oldBase = file.basename;

						const didRoute = await this.handleFileRoute(file, activeNote);

						if (didRoute && !resolved) {
							const newLink = this.app.fileManager.generateMarkdownLink(file, activeNote.path);
							let newPathOnly = '';
							const linkMatch = newLink.match(/!?\[\[([^|\]]+)(?:\|.*)?\]\]/);
							if (linkMatch) {
								newPathOnly = linkMatch[1];
							} else {
								const mdMatch = newLink.match(/!?\[[^\]]*\]\(([^)]+)\)/);
								if (mdMatch) {
									newPathOnly = mdMatch[1];
								}
							}

							if (newPathOnly) {
								this.manuallyUpdateLinksInEditor(activeNote, oldName, newPathOnly);
								this.manuallyUpdateLinksInEditor(activeNote, oldBase, newPathOnly);
							}
						}
					} else {
						await this.handleFileRoute(file);
					}
				}
			})
		);
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
			
			// Compute effective captain folder path (supporting Sub-Captain Mode)
			let effectiveCaptainPath = captainPath;
			if (rule.subCaptainMode && noteParentPath !== captainPath && noteParentPath.startsWith(captainPath + '/')) {
				const relativeSubPath = noteParentPath.substring(captainPath.length + 1);
				const firstSubFolder = relativeSubPath.split('/')[0];
				effectiveCaptainPath = captainPath === "" ? firstSubFolder : `${captainPath}/${firstSubFolder}`;
			}

			targetFolderPath = normalizePath(effectiveCaptainPath === "" || effectiveCaptainPath === "." ? "assets" : `${effectiveCaptainPath}/assets`);

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

			// Compute relative subfolder path from effective Captain Folder to note
			let relativePrefix = '';
			if (effectiveCaptainPath === "") {
				if (noteParentPath !== "") {
					relativePrefix = noteParentPath.split('/').join(settings.delimiter);
				}
			} else if (noteParentPath !== effectiveCaptainPath && noteParentPath.startsWith(effectiveCaptainPath + '/')) {
				const relativeSubPath = noteParentPath.substring(effectiveCaptainPath.length + 1);
				relativePrefix = relativeSubPath.split('/').join(settings.delimiter);
			}

			// Formulate filename
			const prefix = relativePrefix ? `${relativePrefix}${settings.delimiter}${noteIdentifier}` : noteIdentifier;
			const expectedPrefix = `${prefix}${settings.delimiter}`;

			if (file.name.startsWith(expectedPrefix)) {
				targetFileName = file.name;
			} else {
				targetFileName = `${expectedPrefix}${file.name}`;
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
			const prefix = folderPrefix ? `${folderPrefix}${settings.delimiter}${noteIdentifier}` : noteIdentifier;
			const expectedPrefix = `${prefix}${settings.delimiter}`;

			if (file.name.startsWith(expectedPrefix)) {
				targetFileName = file.name;
			} else {
				targetFileName = `${expectedPrefix}${file.name}`;
			}
		}

		// Prevent infinite loops or routing a file that is already exactly where it belongs
		const targetPath = normalizePath(`${targetFolderPath}/${targetFileName}`);
		if (file.path === targetPath) {
			return false;
		}

		// Guard: If the file is already inside targetFolderPath, and its name matches targetFileName, avoid duplicating it.
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

			if (normalizedRulePath.includes('*')) {
				if (this.matchWildcardPath(normalizedRulePath, normalizedNotePath, rule.includeChildren)) {
					matches.push(rule);
				}
			} else if (rule.includeChildren) {
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

	private matchWildcardPath(pattern: string, notePath: string, includeChildren: boolean): boolean {
		const normPattern = normalizePath(pattern);
		const normPath = normalizePath(notePath);

		const regexParts = normPattern.split('/').map(part => {
			if (part === '*') return '[^/]+';
			if (part === '**') return '.*';
			return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]+');
		});

		const regexString = regexParts.join('/');
		const fullRegex = includeChildren ? new RegExp(`^${regexString}(?:/.*)?$`) : new RegExp(`^${regexString}$`);
		return fullRegex.test(normPath);
	}

	async scanAndRouteAssetsForNote(noteFile: TFile) {
		const fileCache = this.app.metadataCache.getFileCache(noteFile);
		if (!fileCache || !fileCache.embeds) {
			new Notice(`No assets found in ${noteFile.basename}.`);
			return;
		}

		let routedCount = 0;
		for (const embed of fileCache.embeds) {
			const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, noteFile.path);
			if (assetFile instanceof TFile) {
				const didRoute = await this.handleFileRoute(assetFile, noteFile);
				if (didRoute) routedCount++;
			}
		}

		if (routedCount > 0) {
			new Notice(`Successfully routed ${routedCount} asset(s).`);
		} else {
			new Notice('No assets needed routing.');
		}
	}

	async waitForMetadataCache(noteFile: TFile, assetFile: TFile, maxWaitMs: number): Promise<boolean> {
		const start = Date.now();
		const assetName = assetFile.name;
		const assetBase = assetFile.basename;

		while (Date.now() - start < maxWaitMs) {
			const cache = this.app.metadataCache.getFileCache(noteFile);
			if (cache) {
				const embeds = cache.embeds || [];
				const links = cache.links || [];

				const hasReference = [...embeds, ...links].some(ref => {
					const linkText = ref.link;
					return linkText === assetName ||
					       linkText === assetBase ||
					       linkText.endsWith('/' + assetName) ||
					       linkText.endsWith('/' + assetBase);
				});

				if (hasReference) {
					return true;
				}
			}
			await new Promise(resolve => window.setTimeout(resolve, 50));
		}
		return false;
	}

	manuallyUpdateLinksInEditor(noteFile: TFile, oldName: string, newLink: string) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file?.path === noteFile.path) {
			const editor = activeView.editor;
			const cursor = editor.getCursor();
			const content = editor.getValue();

			let newContent = content;

			const oldBase = oldName.includes('.') ? oldName.substring(0, oldName.lastIndexOf('.')) : oldName;

			newContent = this.replaceLinkOccurrences(newContent, oldName, newLink);
			newContent = this.replaceLinkOccurrences(newContent, oldBase, newLink);

			if (content !== newContent) {
				editor.setValue(newContent);
				editor.setCursor(cursor);
			}
		}
	}

	replaceLinkOccurrences(content: string, searchName: string, newLink: string): string {
		let result = "";
		let lastIdx = 0;
		let idx = content.indexOf(searchName);

		while (idx !== -1) {
			let replaced = false;

			let foundWikiOpen = false;
			let wikiOpenIdx = -1;
			for (let i = idx - 2; i >= 0 && i >= idx - 200; i--) {
				if (content.charAt(i) === '[' && content.charAt(i + 1) === '[') {
					foundWikiOpen = true;
					wikiOpenIdx = i;
					break;
				}
				if (content.charAt(i) === ']' && content.charAt(i + 1) === ']') break;
			}

			if (foundWikiOpen) {
				const matchEnd = idx + searchName.length;
				let wikiCloseIdx = -1;
				let foundAlias = false;
				let aliasIdx = -1;

				for (let i = matchEnd; i < content.length && i < matchEnd + 100; i++) {
					if (content.charAt(i) === '|' && !foundAlias) {
						foundAlias = true;
						aliasIdx = i;
					}
					if (content.charAt(i) === ']' && content.charAt(i + 1) === ']') {
						wikiCloseIdx = i;
						break;
					}
					if (content.charAt(i) === '[' && content.charAt(i + 1) === '[') break;
				}

				const prefix = content.substring(wikiOpenIdx + 2, idx);
				const isValidPrefix = !/[[\]\n]/.test(prefix);

				if (isValidPrefix) {
					result += content.substring(lastIdx, wikiOpenIdx + 2);
					let aliasText = "";
					if (foundAlias && aliasIdx !== -1) {
						const aliasEnd = wikiCloseIdx !== -1 ? wikiCloseIdx : content.length;
						aliasText = content.substring(aliasIdx, aliasEnd);
					}

					result += newLink + aliasText + "]]";

					if (wikiCloseIdx === -1) {
						lastIdx = matchEnd;
					} else {
						lastIdx = wikiCloseIdx + 2;
					}
					replaced = true;
				}
			}

			if (!replaced) {
				let foundMdOpen = false;
				let mdOpenIdx = -1;
				for (let i = idx - 2; i >= 0 && i >= idx - 200; i--) {
					if (content.charAt(i) === ']' && content.charAt(i + 1) === '(') {
						foundMdOpen = true;
						mdOpenIdx = i + 1;
						break;
					}
					if (content.charAt(i) === ')') break;
				}

				if (foundMdOpen) {
					const matchEnd = idx + searchName.length;
					let mdCloseIdx = -1;
					for (let i = matchEnd; i < content.length && i < matchEnd + 200; i++) {
						if (content.charAt(i) === ')') {
							mdCloseIdx = i;
							break;
						}
						if (content.charAt(i) === '(') break;
					}

					const prefix = content.substring(mdOpenIdx + 1, idx);
					const isValidPrefix = !/[()\n]/.test(prefix);

					if (isValidPrefix) {
						result += content.substring(lastIdx, mdOpenIdx + 1);
						result += newLink.replace(/ /g, '%20') + ")";
						if (mdCloseIdx === -1) {
							lastIdx = matchEnd;
						} else {
							lastIdx = mdCloseIdx + 1;
						}
						replaced = true;
					}
				}
			}

			if (!replaced) {
				result += content.substring(lastIdx, idx);
				result += searchName;
				lastIdx = idx + searchName.length;
			}

			idx = content.indexOf(searchName, lastIdx);
		}

		result += content.substring(lastIdx);
		return result;
	}

	async rescanCentralizedAssets() {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		let totalRouted = 0;
		let scannedNotes = 0;

		new Notice("Starting Centralized Mode rescan...");

		for (const note of markdownFiles) {
			const parentPath = note.parent ? note.parent.path : "";
			const rule = this.findMatchingRule(parentPath);
			if (!rule) {
				const fileCache = this.app.metadataCache.getFileCache(note);
				if (fileCache && fileCache.embeds) {
					scannedNotes++;
					for (const embed of fileCache.embeds) {
						const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
						if (assetFile instanceof TFile) {
							const didRoute = await this.handleFileRoute(assetFile, note);
							if (didRoute) totalRouted++;
						}
					}
				}
			}
		}

		new Notice(`Centralized rescan complete. Scanned ${scannedNotes} note(s). Routed ${totalRouted} asset(s).`);
	}

	async rescanAllNestedAssets() {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		let totalRouted = 0;
		let scannedNotes = 0;

		new Notice("Starting Nested Mode rescan...");

		for (const note of markdownFiles) {
			const parentPath = note.parent ? note.parent.path : "";
			const rule = this.findMatchingRule(parentPath);
			if (rule) {
				const fileCache = this.app.metadataCache.getFileCache(note);
				if (fileCache && fileCache.embeds) {
					scannedNotes++;
					for (const embed of fileCache.embeds) {
						const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
						if (assetFile instanceof TFile) {
							const didRoute = await this.handleFileRoute(assetFile, note);
							if (didRoute) totalRouted++;
						}
					}
				}
			}
		}

		new Notice(`Nested rescan complete. Scanned ${scannedNotes} note(s). Routed ${totalRouted} asset(s).`);
	}

	async rescanFolderRuleAssets(targetRule: FolderRule) {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		let totalRouted = 0;
		let scannedNotes = 0;

		new Notice(`Starting rescan for rule: ${targetRule.path === "" ? "/" : targetRule.path}...`);

		for (const note of markdownFiles) {
			const parentPath = note.parent ? note.parent.path : "";
			const matchedRule = this.findMatchingRule(parentPath);
			if (matchedRule && matchedRule.path === targetRule.path) {
				const fileCache = this.app.metadataCache.getFileCache(note);
				if (fileCache && fileCache.embeds) {
					scannedNotes++;
					for (const embed of fileCache.embeds) {
						const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
						if (assetFile instanceof TFile) {
							const didRoute = await this.handleFileRoute(assetFile, note);
							if (didRoute) totalRouted++;
						}
					}
				}
			}
		}

		new Notice(`Rule rescan complete. Scanned ${scannedNotes} note(s). Routed ${totalRouted} asset(s).`);
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
