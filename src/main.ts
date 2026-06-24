import { Notice, Plugin, TFolder, TFile, MarkdownView } from 'obsidian';
import { DiagramRenderer } from './renderers/DiagramRenderer';
import { buildTabTree } from './utils/parser';
import { copyToClipboard } from './utils/clipboard';

// Asset Router imports
import { AssetRouterSettings, FolderRule } from './types';
import { DEFAULT_SETTINGS, AssetRouterSettingTab } from './settings';
import { registerCommands } from './commands';
import { AssetRouter } from './router';

export default class TreeDiagramPlugin extends Plugin {
	// Store settings panel state per codeblock (keyed by source hash)
	settingsPanelStates: Map<string, boolean> = new Map();

	// Asset Router settings & router
	settings!: AssetRouterSettings;
	router!: AssetRouter;

	async onload() {
		// 1. Initialize Asset Router settings and router
		await this.loadSettings();
		this.router = new AssetRouter(this.app, () => this.settings);

		// 2. Register single tree code block processor (Tree Diagram)
		this.registerMarkdownCodeBlockProcessor("tree", async (source, el, ctx) => {
			ctx.addChild(new DiagramRenderer(this, source, el, ctx));
		});

		// 3. Listen to file creations in the vault (Asset Router)
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (file instanceof TFile) {
					// Locate active note at the time of creation
					const activeNote = this.app.workspace.getActiveFile();
					if (activeNote) {
						// Determine appropriate wait time based on file name pattern
						const isPasted = file.name.startsWith('Pasted image');
						const maxWait = isPasted ? 2000 : 500;

						// Wait for metadata cache to register the link to the new asset
						const resolved = await this.waitForMetadataCache(activeNote, file, maxWait);

						const oldName = file.name;
						const oldBase = file.basename;

						// Run the routing logic
						const didRoute = await this.router.handleFileRoute(file, activeNote);

						// Fallback: if renamed successfully but metadata cache didn't update in time,
						// manually search and replace the link in the active editor.
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
						// If no active note, route directly
						await this.router.handleFileRoute(file);
					}
				}
			})
		);

		// 4. Add settings tab for Asset Router
		this.addSettingTab(new AssetRouterSettingTab(this.app, this));

		// 5. Register commands (Tree Diagram)
		this.addCommand({
			id: "copy-vault-tree-tabs",
			name: "Copy vault tree source (folders + files)",
			callback: async () => {
				const root = this.app.vault.getRoot();
				const text = buildTabTree(root, true).join("\n");
				await copyToClipboard(text);
				new Notice("Vault tree source copied");
			},
		});

		this.addCommand({
			id: "copy-vault-folders-tabs",
			name: "Copy vault tree source (folders only)",
			callback: async () => {
				const root = this.app.vault.getRoot();
				const text = buildTabTree(root, false).join("\n");
				await copyToClipboard(text);
				new Notice("Vault folders source copied");
			},
		});

		this.addCommand({
			id: "copy-current-folder-tabs",
			name: "Copy current note folder source tree",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active note");
					return;
				}
				const text = buildTabTree(file.parent as TFolder, true).join("\n");
				await copyToClipboard(text);
				new Notice("Current folder tree copied");
			},
		});

		// 6. Register commands (Asset Router)
		registerCommands(this);

		new Notice('Tree Diagram and Asset Router Loaded');
	}

	onunload() { }

	// =========================================================================
	// Asset Router Methods
	// =========================================================================

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Scans the active note for attachments and routes them.
	 */
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
				const didRoute = await this.router.handleFileRoute(assetFile, noteFile);
				if (didRoute) routedCount++;
			}
		}

		if (routedCount > 0) {
			new Notice(`Successfully routed ${routedCount} asset(s).`);
		} else {
			new Notice('No assets needed routing.');
		}
	}

	/**
	 * Polls the metadata cache of the target note file to see if it registers
	 * a link/embed pointing to the newly created asset.
	 */
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
			// Poll every 50ms
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		return false;
	}

	/**
	 * Searches the active editor content for references to the original file
	 * and replaces them with the new link path as a fallback.
	 */
	manuallyUpdateLinksInEditor(noteFile: TFile, oldName: string, newLink: string) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file?.path === noteFile.path) {
			const editor = activeView.editor;
			const cursor = editor.getCursor();
			const content = editor.getValue();

			let newContent = content;

			// We will replace occurrences of both oldName (full name) and oldName without extension (basename)
			const oldBase = oldName.includes('.') ? oldName.substring(0, oldName.lastIndexOf('.')) : oldName;

			newContent = this.replaceLinkOccurrences(newContent, oldName, newLink);
			newContent = this.replaceLinkOccurrences(newContent, oldBase, newLink);

			if (content !== newContent) {
				editor.setValue(newContent);
				editor.setCursor(cursor);
				console.log("[Asset Router] Manually updated link in editor as fallback (no-regex).");
			}
		}
	}

	/**
	 * Scans the note content string and replaces occurrences of searchName
	 * if they are part of a wiki link or markdown link structure, without using RegExp.
	 */
	replaceLinkOccurrences(content: string, searchName: string, newLink: string): string {
		let result = "";
		let lastIdx = 0;
		let idx = content.indexOf(searchName);

		while (idx !== -1) {
			result += content.substring(lastIdx, idx);
			let replaced = false;

			// 1. Check Wikilink: Look backwards for '[['
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
				const isValidPrefix = !/[\[\]\n]/.test(prefix);

				if (isValidPrefix) {
					let aliasText = "";
					if (foundAlias && aliasIdx !== -1) {
						const aliasEnd = wikiCloseIdx !== -1 ? wikiCloseIdx : content.length;
						aliasText = content.substring(aliasIdx, aliasEnd);
					}

					result += newLink + aliasText;

					if (wikiCloseIdx === -1) {
						result += "]]";
						lastIdx = matchEnd;
					} else {
						lastIdx = wikiCloseIdx + 2;
					}
					replaced = true;
				}
			}

			// 2. Check Markdown link: Look backwards for ']('
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
					const isValidPrefix = !/[\(\)\n]/.test(prefix);

					if (isValidPrefix) {
						result += newLink.replace(/ /g, '%20');
						if (mdCloseIdx === -1) {
							result += ")";
							lastIdx = matchEnd;
						} else {
							lastIdx = mdCloseIdx + 1;
						}
						replaced = true;
					}
				}
			}

			if (!replaced) {
				result += searchName;
				lastIdx = idx + searchName.length;
			}

			idx = content.indexOf(searchName, lastIdx);
		}

		result += content.substring(lastIdx);
		return result;
	}

	/**
	 * Scans the entire vault for note files and organizes all assets
	 * belonging to Centralized Mode (notes not matching any Captain Folder rules).
	 */
	async rescanCentralizedAssets() {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		let totalRouted = 0;
		let scannedNotes = 0;

		new Notice("Starting Centralized Mode rescan...");

		for (const note of markdownFiles) {
			const parentPath = note.parent ? note.parent.path : "";
			const rule = this.router.findMatchingRule(parentPath);
			// Only scan if no Nested Mode rule matches this note
			if (!rule) {
				const fileCache = this.app.metadataCache.getFileCache(note);
				if (fileCache && fileCache.embeds) {
					scannedNotes++;
					for (const embed of fileCache.embeds) {
						const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
						if (assetFile instanceof TFile) {
							const didRoute = await this.router.handleFileRoute(assetFile, note);
							if (didRoute) totalRouted++;
						}
					}
				}
			}
		}

		new Notice(`Centralized rescan complete. Scanned ${scannedNotes} note(s). Routed ${totalRouted} asset(s).`);
	}

	/**
	 * Scans the entire vault for note files and organizes all assets
	 * belonging to any active Captain Folder rules (Nested Mode).
	 */
	async rescanAllNestedAssets() {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		let totalRouted = 0;
		let scannedNotes = 0;

		new Notice("Starting Nested Mode rescan...");

		for (const note of markdownFiles) {
			const parentPath = note.parent ? note.parent.path : "";
			const rule = this.router.findMatchingRule(parentPath);
			// Only scan if a Nested Mode rule matches this note
			if (rule) {
				const fileCache = this.app.metadataCache.getFileCache(note);
				if (fileCache && fileCache.embeds) {
					scannedNotes++;
					for (const embed of fileCache.embeds) {
						const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
						if (assetFile instanceof TFile) {
							const didRoute = await this.router.handleFileRoute(assetFile, note);
							if (didRoute) totalRouted++;
						}
					}
				}
			}
		}

		new Notice(`Nested rescan complete. Scanned ${scannedNotes} note(s). Routed ${totalRouted} asset(s).`);
	}

	/**
	 * Scans the entire vault for note files and organizes assets
	 * that match a specific Captain Folder rule.
	 */
	async rescanFolderRuleAssets(targetRule: FolderRule) {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		let totalRouted = 0;
		let scannedNotes = 0;

		new Notice(`Starting rescan for rule: ${targetRule.path === "" ? "/" : targetRule.path}...`);

		for (const note of markdownFiles) {
			const parentPath = note.parent ? note.parent.path : "";
			const matchedRule = this.router.findMatchingRule(parentPath);
			// Only scan if the note's active matching rule is the target rule
			if (matchedRule && matchedRule.path === targetRule.path) {
				const fileCache = this.app.metadataCache.getFileCache(note);
				if (fileCache && fileCache.embeds) {
					scannedNotes++;
					for (const embed of fileCache.embeds) {
						const assetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
						if (assetFile instanceof TFile) {
							const didRoute = await this.router.handleFileRoute(assetFile, note);
							if (didRoute) totalRouted++;
						}
					}
				}
			}
		}

		new Notice(`Rule rescan complete. Scanned ${scannedNotes} note(s). Routed ${totalRouted} asset(s).`);
	}
}
