import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	TAbstractFile,
	WorkspaceLeaf,
	TFile,
	TFolder,
} from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from './settings';
import GoogleIframeView, {
	GOOGLE_IFRAME_VIEW_TYPE,
	cleanGoogleUrl,
	urlsMatch,
	getRealBookmarksPath,
	readChromeBookmarks,
	writeChromeBookmarks,
	getMaxIdInTree,
	extractGoogleFileId,
} from './googleIframeView';
import BookmarksView, { BOOKMARKS_VIEW_TYPE } from './bookmarksView';
import {
	copyFile,
	createFolder,
	getFileMetadata,
	getOriginalFolderChain,
	getFileWebViewLink,
} from './googleDriveApi';


export default class MyPlugin extends Plugin {
	// Map to keep a single leaf per Google file
	private openLeavesMap: Map<string, WorkspaceLeaf> = new Map();
	private pendingCopies: Set<string> = new Set();
	private processingCopies: Set<string> = new Set();
	private debounceTimers: Map<string, any> = new Map();
	private activeCopies: Map<string, {
		sourcePath: string;
		destPath: string;
		method: string;
		status: 'pending' | 'copying' | 'done' | 'failed';
		error?: string;
	}> = new Map();
	private activeNotice: Notice | null = null;
	private isReloadModalOpen = false;

	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		this.refreshDynamicStyles();

		// Listen for file‑open events (click in file explorer)
		this.registerEvent(
			this.app.workspace.on('file-open', this.handleFileOpen.bind(this)),
		);

		// Listen for newly created files/folders (copies)
		this.registerEvent(
			this.app.vault.on('create', this.handleFileCreate.bind(this))
		);
		this.registerEvent(
			this.app.vault.on('modify', this.handleFileModify.bind(this))
		);

		// Migrate URL cache + open leaves when a Google file is renamed
		this.registerEvent(
			this.app.vault.on('rename', async (abstractFile, oldPath) => {
				if (!(abstractFile instanceof TFile)) return;
				const ext = abstractFile.extension?.toLowerCase();
				if (!['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) return;

				// Move cached URL from old path to new path so the file opens without asking for URL again
				if (this.settings.urlCache?.[oldPath]) {
					this.settings.urlCache[abstractFile.path] = this.settings.urlCache[oldPath];
					delete this.settings.urlCache[oldPath];
					await this.saveSettings();
				}

				// Move open leaf reference from old path to new path
				const leaf = this.openLeavesMap.get(oldPath);
				if (leaf) {
					this.openLeavesMap.delete(oldPath);
					this.openLeavesMap.set(abstractFile.path, leaf);
				}
			})
		);

		// Register right-click context menu events for Google Drive files and folders
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile) {
					const ext = file.extension?.toLowerCase();
					if (['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) {
						menu.addItem((item) => {
							item.setTitle('Duplicate Google file (Cloud + Local)')
								.setIcon('copy')
								.onClick(async () => {
									await this.duplicateGoogleFileViaMenu(file);
								});
						});
					}
				} else if (file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle('Duplicate Google folder structure')
							.setIcon('folder')
							.onClick(async () => {
								await this.duplicateGoogleFolderViaMenu(file);
							});
					});
				}
			})
		);

		// Register custom iframe view for Google embeds
		this.registerView(GOOGLE_IFRAME_VIEW_TYPE, (leaf) => new GoogleIframeView(leaf, this));
    // Make Obsidian open .gdoc etc. with our custom view
    this.registerExtensions(['gdoc','gsheet','gform','gslides','gdraw'], GOOGLE_IFRAME_VIEW_TYPE);

		// Register Chrome Bookmarks sidebar
		this.registerView(BOOKMARKS_VIEW_TYPE, (leaf) => new BookmarksView(leaf, this));

		// Ribbon icon — opens the bookmarks panel
		this.addRibbonIcon('bookmark', 'Open bookmarks', () => this.openBookmarksPanel());

		// Ribbon icon — manual refresh of Google files and vault explorer
		this.addRibbonIcon('sync', 'Refresh Google files', () => {
			this.refreshVaultAndExplorer();
			new Notice('Google files and Explorer refreshed.');
		});

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		this.addCommand({
			id: 'open-bookmarks-panel',
			name: 'Open bookmarks panel',
			callback: () => this.openBookmarksPanel(),
		});

		this.addCommand({
			id: 'refresh-gdrive-files',
			name: 'Refresh Google Drive files and explorer',
			callback: () => {
				this.refreshVaultAndExplorer();
				new Notice('Google files and Explorer refreshed.');
			}
		});

		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => new SampleModal(this.app).open(),
		});

		// Command useful for manual testing
		this.addCommand({
			id: 'open-google-file',
			name: 'Open Google Workspace File',
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				const isGoogle = ['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(
					file.extension ?? '',
				);
				if (checking) return isGoogle;
				if (isGoogle) this.handleFileOpen(file);
				return true;
			},
		});

		this.addCommand({
			id: 'cleanup-orphaned-gdrive-tabs',
			name: 'Clean up orphaned Google Drive tabs',
			callback: () => {
				this.cleanupOpenedTabsOnLoad(false);
			}
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));

		// Auto-initialize the bookmarks view in the left sidebar on startup
		this.app.workspace.onLayoutReady(async () => {
			await this.syncLocalBookmarksToChrome();
			this.initBookmarksView();
			this.updateAllTabIcons();
			this.injectColorCircles();

			// Handle late/asynchronous layout restoration of background tabs
			setTimeout(() => { this.updateAllTabIcons(); this.injectColorCircles(); }, 500);
			setTimeout(() => { this.updateAllTabIcons(); this.injectColorCircles(); }, 1500);
			setTimeout(() => { this.updateAllTabIcons(); this.injectColorCircles(); }, 4000);

			// Watch the file tree for newly rendered items (folder expand, etc.)
			this.setupExplorerObserver();

			// Run tab cleanup on load (silently) to clear any invalid or orphaned Google Drive tabs
			setTimeout(() => {
				this.cleanupOpenedTabsOnLoad(true);
			}, 2000);
		});
	}

	private explorerObserver: MutationObserver | null = null;
	private injectDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	private setupExplorerObserver() {
		if (this.explorerObserver) return;
		const fileExplorer = document.querySelector('.nav-files-container');
		if (!fileExplorer) return;
		this.explorerObserver = new MutationObserver((mutations) => {
			// Ignore mutations that only involve our own circles
			const hasRealChange = mutations.some(m =>
				Array.from(m.addedNodes).some((n: any) => !n.classList?.contains('gdrive-icon-circle')) ||
				Array.from(m.removedNodes).some((n: any) => !n.classList?.contains('gdrive-icon-circle'))
			);
			if (!hasRealChange) return;
			// Debounce to avoid flooding
			if (this.injectDebounceTimer) clearTimeout(this.injectDebounceTimer);
			this.injectDebounceTimer = setTimeout(() => {
				this.explorerObserver?.disconnect();
				this.injectColorCircles();
				if (fileExplorer) this.explorerObserver?.observe(fileExplorer, { childList: true, subtree: true });
			}, 50);
		});
		this.explorerObserver.observe(fileExplorer, { childList: true, subtree: true });
		this.register(() => {
			this.explorerObserver?.disconnect();
			this.explorerObserver = null;
		});
	}

	private async initBookmarksView() {
		const existing = this.app.workspace.getLeavesOfType(BOOKMARKS_VIEW_TYPE);
		if (existing.length > 0) return;

		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: BOOKMARKS_VIEW_TYPE, active: false });
		}
	}

	private async syncLocalBookmarksToChrome() {
		const bpath = getRealBookmarksPath(this);
		if (!bpath) return;
		try {
			const data = readChromeBookmarks(bpath);
			const local = this.settings.localBookmarks || [];
			if (local.length === 0) return;

			let modified = false;

			const existsInNode = (node: any, url: string): boolean => {
				if (node.type === 'url' && urlsMatch(node.url, url, this.settings.urlCleaningRules)) {
					return true;
				}
				if (node.children) {
					for (const child of node.children) {
						if (existsInNode(child, url)) return true;
					}
				}
				return false;
			};

			const roots = [data.roots.bookmark_bar, data.roots.other, data.roots.synced].filter(Boolean);

			if (!data.roots.other) {
				data.roots.other = {
					children: [],
					date_added: (Date.now() * 1000 + 11644473600000000).toString(),
					date_modified: (Date.now() * 1000 + 11644473600000000).toString(),
					id: '2',
					name: 'Other bookmarks',
					type: 'folder'
				};
				modified = true;
			}
			if (!data.roots.other.children) {
				data.roots.other.children = [];
				modified = true;
			}

			for (const item of local) {
				let exists = false;
				for (const r of roots) {
					if (existsInNode(r, item.url || '')) {
						exists = true;
						break;
					}
				}
				if (!exists) {
					const maxId = getMaxIdInTree(roots);
					item.id = (maxId + 1).toString();
					data.roots.other.children.push(item);
					modified = true;
				}
			}

			if (modified) {
				console.log('[GDrive] Syncing local bookmarks back to Chrome file...');
				writeChromeBookmarks(bpath, data);
			}
		} catch (e) {
			console.warn('[GDrive] Bookmark sync error:', e);
		}
	}

	private async openBookmarksPanel() {
		// Reuse existing panel if open
		const existing = this.app.workspace.getLeavesOfType(BOOKMARKS_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]!);
			return;
		}
		// Open in left sidebar (next to File Explorer)
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: BOOKMARKS_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	/** -------------------------------------------------------------
	 *  Open/Reuse a leaf for Google Workspace files
	 *  ------------------------------------------------------------- */
	private async handleFileOpen(file: TFile) {
		if (!file) return;
		const ext = file.extension?.toLowerCase();
		console.log('[GDrive] file-open event. ext:', ext, 'path:', file.path);
		if (!['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) return;

		// ── Step 1: Check URL cache first (handles renames and Drive streaming files) ──
		const cachedUrl = this.settings.urlCache?.[file.path];
		if (cachedUrl) {
			const cleanedCache = cleanGoogleUrl(cachedUrl, this.settings.urlCleaningRules);
			const existingLeaf = this.openLeavesMap.get(file.path);
			if (existingLeaf) {
				this.app.workspace.revealLeaf(existingLeaf);
				return;
			}
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({
				type: GOOGLE_IFRAME_VIEW_TYPE,
				state: { url: cleanedCache, file: file.path, title: file.basename },
			});
			const view = leaf.view as unknown as GoogleIframeView;
			view.navigateTo(cleanedCache, file.basename, file.path);
			this.openLeavesMap.set(file.path, leaf);
			return;
		}

		// ── Step 2: Try to read the Google URL from the file contents ──
		let rawUrl: string | null = null;
		try {
			const content = await this.app.vault.read(file);
			console.log('[GDrive] file content:', content.substring(0, 200));
			const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
			if (urlMatch) {
				rawUrl = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
			}
		} catch (e) {
			console.warn('[GDrive] Could not read file content:', e);
		}

		if (!rawUrl) {
			// No URL in content and not in cache — setState will show the URL input modal
			console.log('[GDrive] No URL found in cache or file content for:', file.path);
			return;
		}
		console.log('[GDrive] rawUrl from content:', rawUrl);

		// ── Step 3: Cache the URL and open the file ──
		if (!this.settings.urlCache) this.settings.urlCache = {};
		this.settings.urlCache[file.path] = rawUrl;
		await this.saveSettings();

		// Re‑use an existing leaf if the file is already open
		const existingLeaf = this.openLeavesMap.get(file.path);
		if (existingLeaf) {
			const view = existingLeaf.view as any;
			if (view && typeof view.getCurrentUrl === 'function') {
				const currentUrl = view.getCurrentUrl();
				if (urlsMatch(currentUrl, rawUrl, this.settings.urlCleaningRules)) {
					this.app.workspace.revealLeaf(existingLeaf);
					return;
				} else {
					// The open leaf has navigated away! Remove it from the map so we open a new tab
					this.openLeavesMap.delete(file.path);
				}
			} else {
				// Fallback if view is not fully loaded/initialized yet
				this.app.workspace.revealLeaf(existingLeaf);
				return;
			}
		}

		// Create a new leaf using our custom webview-based view
		const leaf = this.app.workspace.getLeaf(true);
		console.log('[GDrive] leaf created, calling setViewState...');
		await leaf.setViewState({
			type: GOOGLE_IFRAME_VIEW_TYPE,
			state: { url: rawUrl, filePath: file.path, title: file.basename },
		});
		console.log('[GDrive] setViewState done. leaf.view type:', leaf.view?.getViewType());

		// Directly call navigateTo — guaranteed to work regardless of setState/onOpen order
		const view = leaf.view as unknown as GoogleIframeView;
		console.log('[GDrive] calling navigateTo on view:', view);
		view.navigateTo(rawUrl, file.basename, file.path);

		this.openLeavesMap.set(file.path, leaf);




		// Clean up the map when the leaf is destroyed
		this.registerEvent(
			(this.app.workspace as any).on('leaf-destroy', (leaf: WorkspaceLeaf) => {
				const state = leaf.getViewState();
				if (state.type === GOOGLE_IFRAME_VIEW_TYPE && (state.state as any).filePath) {
					this.openLeavesMap.delete((state.state as any).filePath);
				}
			}),
		);
	}

	private async handleFileCreate(abstractFile: TAbstractFile) {
		if (!(abstractFile instanceof TFile)) return;
		const ext = abstractFile.extension?.toLowerCase();
		if (!['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) return;

		// Track that this file is newly created to capture subsequent writes
		this.pendingCopies.add(abstractFile.path);
		setTimeout(() => {
			this.pendingCopies.delete(abstractFile.path);
		}, 15000);

		this.scheduleDuplicationCheck(abstractFile);
	}

	private async handleFileModify(abstractFile: TAbstractFile) {
		if (!(abstractFile instanceof TFile)) return;
		if (!this.pendingCopies.has(abstractFile.path)) return;

		this.scheduleDuplicationCheck(abstractFile);
	}

	private scheduleDuplicationCheck(file: TFile) {
		if (this.debounceTimers.has(file.path)) {
			clearTimeout(this.debounceTimers.get(file.path));
		}
		const timer = setTimeout(() => {
			this.debounceTimers.delete(file.path);
			this.checkForDuplication(file);
		}, 1000);
		this.debounceTimers.set(file.path, timer);
	}

	private async tryAutoDetectUrl(vaultRelPath: string): Promise<string | null> {
		try {
			const path = require('path') as typeof import('path');
			const { execSync } = require('child_process') as typeof import('child_process');
			const basePath = (this.app.vault.adapter as any).basePath;
			const fullPath = path.join(basePath, vaultRelPath);
			const findUrl = (s: string) =>
				(s.match(/https:\/\/docs\.google\.com\/[^\s"'<>\]]+/) ?? [])[0] ?? null;

			// List all NTFS alternate data streams and read each one
			const escaped = fullPath.replace(/'/g, "''");
			const streamList = execSync(
				`powershell -NoProfile -NonInteractive -Command "` +
				`Get-Item -LiteralPath '${escaped}' -Stream * | Select-Object -ExpandProperty Stream"`,
				{ encoding: 'utf8', timeout: 5000 }
			);
			const streams = streamList.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);

			for (const stream of streams) {
				if (stream === ':$DATA' || stream === '$DATA' || stream === '') continue;
				try {
					const content = execSync(
						`powershell -NoProfile -NonInteractive -Command "` +
						`Get-Content -LiteralPath '${escaped}' -Stream '${stream}' -Raw"`,
						{ encoding: 'utf8', timeout: 5000 }
					);
					const url = findUrl(content);
					if (url) return url;
				} catch {}
			}
		} catch (e: any) {
			console.warn('[GDrive Duplication] ADS read failed:', e.message);
		}
		return null;
	}

	private cleanPathSegments(p: string): string {
		return p.split('/')
			.map(seg => seg.toLowerCase()
				.replace(/^(copy of|copy)\s+/, '')
				.replace(/\s+(copy|\d+)(\.[a-z0-9]+)?$/i, '')
				.trim()
			)
			.join('/');
	}

	private async findOriginalFileByUrl(url: string, excludePath: string): Promise<string | null> {
		// 1. Fast O(1) lookup in cache
		const cachedPath = Object.keys(this.settings.urlCache || {}).find(
			path => path !== excludePath && urlsMatch(this.settings.urlCache[path] || '', url, this.settings.urlCleaningRules)
		);
		if (cachedPath) return cachedPath;

		// 2. Scan vault files with Google extensions if not in cache (solves copy of a copy when cache is cold)
		const files = this.app.vault.getFiles();
		for (const file of files) {
			if (file.path === excludePath) continue;
			const ext = file.extension?.toLowerCase();
			if (!['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) continue;

			// If it's already in cache and didn't match step 1, skip
			if (this.settings.urlCache?.[file.path]) continue;

			try {
				const content = await this.app.vault.read(file);
				const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
				if (urlMatch) {
					const cleaned = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
					// Cache it so we don't have to read it next time
					if (!this.settings.urlCache) this.settings.urlCache = {};
					this.settings.urlCache[file.path] = cleaned;
					await this.saveSettings();

					if (urlsMatch(cleaned, url, this.settings.urlCleaningRules)) {
						return file.path;
					}
				}
			} catch {}
		}
		return null;
	}

	private async findOriginalFile(file: TFile, rawUrl: string | null): Promise<{ path: string, method: string } | null> {
		// 1. If we have a URL from the content, search by URL
		if (rawUrl) {
			const pathByUrl = await this.findOriginalFileByUrl(rawUrl, file.path);
			if (pathByUrl) return { path: pathByUrl, method: 'URL Match' };
		}

		// 2. Fallback: match by filename heuristics (essential for 0-byte streaming files)
		const cleanNewPath = this.cleanPathSegments(file.path);
		const files = this.app.vault.getFiles();
		let bestMatch: string | null = null;
		let bestScore = -1;
		
		for (const other of files) {
			if (other.path === file.path) continue;
			const ext = other.extension?.toLowerCase();
			if (!['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) continue;

			const cleanOtherPath = this.cleanPathSegments(other.path);
			if (cleanNewPath === cleanOtherPath) {
				// Score based on length of common prefix of the raw paths
				let commonPrefixLen = 0;
				const minLen = Math.min(other.path.length, file.path.length);
				for (let i = 0; i < minLen; i++) {
					if (other.path[i] === file.path[i]) {
						commonPrefixLen++;
					} else {
						break;
					}
				}

				let score = commonPrefixLen * 10;
				if (this.settings.urlCache?.[other.path]) {
					score += 5;
				}

				if (score > bestScore) {
					bestScore = score;
					bestMatch = other.path;
				}
			}
		}
		
		if (bestMatch) {
			return { path: bestMatch, method: 'Filename Heuristics' };
		}
		return null;
	}

	private async checkForDuplication(file: TFile) {
		const ext = file.extension?.toLowerCase();
		if (!['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) return;

		if (this.processingCopies.has(file.path)) return;

		// 1. Read the file content and see if it contains a Google Doc URL
		let rawUrl: string | null = null;
		try {
			const content = await this.app.vault.read(file);
			const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
			if (urlMatch) {
				rawUrl = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
			}
		} catch (e: any) {
			if (e.code === 'EISDIR' || e.message?.includes('EISDIR')) {
				console.log('[GDrive Duplication Debug] File is a streamed virtual directory (EISDIR). Skipping direct content read.');
			} else {
				console.warn('[GDrive Duplication Debug] Could not read file content:', e);
			}
		}

		// 2. If content is empty (0-byte streaming file), try to check ADS for this file
		if (!rawUrl) {
			const adsUrl = await this.tryAutoDetectUrl(file.path);
			if (adsUrl) {
				rawUrl = cleanGoogleUrl(adsUrl, this.settings.urlCleaningRules);
			}
		}

		// 3. Find the original file candidate (URL lookup or structural path matching)
		const origResult = await this.findOriginalFile(file, rawUrl);

		if (!origResult) {
			console.log(`[GDrive Duplication Debug] Check finished: No matching original file found for: ${file.path}`);
			return;
		}

		const { path: origPath, method } = origResult;

		// Print the exact requested format to the developer console!
		console.log(
			`%c[GDrive Duplication Debug] IF COPY WHAT FILES BEING DUPLICATED:\n` +
			`- Source: ${origPath}\n` +
			`- Destination: ${file.path}\n` +
			`- Method: ${method}`,
			'color: #00ffcc; font-weight: bold; font-size: 11px;'
		);

		// Track duplication status in UI list
		this.activeCopies.set(file.path, {
			sourcePath: origPath,
			destPath: file.path,
			method: method,
			status: 'pending'
		});
		this.updateActiveNotice();

		// 4. Resolve the original file's URL
		let originalUrl = this.settings.urlCache?.[origPath];
		let originalMethod = 'Cache Lookup';
		if (!originalUrl) {
			// Try reading original file content
			try {
				const origFileObj = this.app.vault.getAbstractFileByPath(origPath);
				if (origFileObj instanceof TFile) {
					const content = await this.app.vault.read(origFileObj);
					const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
					if (urlMatch) {
						originalUrl = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
						originalMethod = 'File Content Read';
					}
				}
			} catch {}
		}
		if (!originalUrl) {
			// Try reading original file ADS
			const adsUrl = await this.tryAutoDetectUrl(origPath);
			if (adsUrl) {
				originalUrl = cleanGoogleUrl(adsUrl, this.settings.urlCleaningRules);
				originalMethod = 'NTFS Alternate Data Stream';
			}
		}
		if (!originalUrl) {
			// Fallback: search Google Drive by original name
			const origFileObj = this.app.vault.getAbstractFileByPath(origPath);
			if (origFileObj instanceof TFile) {
				console.log('[GDrive Duplication Debug] URL not in cache/content/ADS. Searching on Drive by name:', origFileObj.basename);
				const searchUrl = await getFileWebViewLink(this, origFileObj.basename, origFileObj.extension);
				if (searchUrl) {
					originalUrl = searchUrl;
					originalMethod = 'Drive Search by Name';
					if (!this.settings.urlCache) this.settings.urlCache = {};
					this.settings.urlCache[origPath] = originalUrl;
					await this.saveSettings();
				}
			}
		}

		if (!originalUrl) {
			console.warn('[GDrive Duplication Debug] Could not resolve Google Drive URL for original file:', origPath);
			const current = this.activeCopies.get(file.path);
			if (current) {
				current.status = 'failed';
				current.error = 'Could not resolve source GDrive link';
			}
			this.updateActiveNotice();
			return;
		}

		// Mark as processing so we don't trigger it again
		this.processingCopies.add(file.path);
		this.pendingCopies.delete(file.path);

		console.log(`[GDrive Duplication Debug] Resolved source URL via: ${originalMethod} -> ${originalUrl}`);

		const originalFileId = extractGoogleFileId(originalUrl);
		if (!originalFileId) {
			console.warn('[GDrive Duplication Debug] Could not extract File ID from URL:', originalUrl);
			const current = this.activeCopies.get(file.path);
			if (current) {
				current.status = 'failed';
				current.error = 'Invalid Google link format';
			}
			this.updateActiveNotice();
			this.processingCopies.delete(file.path);
			return;
		}

		try {
			// Get or create parent folder ID on Google Drive
			const origDir = origPath.includes('/') ? origPath.substring(0, origPath.lastIndexOf('/')) : '';
			const copyDir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
			
			let newParentFolderId: string | undefined = undefined;

			if (copyDir && origDir !== copyDir) {
				// We need to recursively get or create the folder structure on Google Drive
				const copyDirSegs = copyDir.split('/');
				// Pre-fetch the parent chain of the original file to map directories properly
				const chain = await getOriginalFolderChain(this, originalFileId, copyDirSegs.length + 1);
				
				const getOrCreateFolderRecursive = async (localPath: string): Promise<string | null> => {
					if (!localPath) return null;
					const cached = this.settings.urlCache?.[localPath];
					if (cached) {
						const cachedId = extractGoogleFileId(cached);
						if (cachedId) return cachedId;
					}

					const parentLocalPath = localPath.includes('/') ? localPath.substring(0, localPath.lastIndexOf('/')) : '';
					const parentDriveId = await getOrCreateFolderRecursive(parentLocalPath);

					// Determine the parent's name
					const folderName = localPath.includes('/') ? localPath.split('/').pop() || localPath : localPath;

					// Create the folder on Google Drive
					let driveParentId: string | undefined = parentDriveId || undefined;
					if (!driveParentId) {
						// Fallback: try to find the counterpart parent folder ID from the original file's parent chain
						const localSegs = localPath.split('/');
						const diff = copyDirSegs.length - localSegs.length;
						if (chain && chain[diff + 1]) {
							driveParentId = chain[diff + 1];
						}
					}

					console.log(`[GDrive Duplication Debug] Creating folder "${folderName}" on Google Drive under:`, driveParentId);
					const folderResult = await createFolder(this, folderName, driveParentId);
					if (folderResult) {
						if (!this.settings.urlCache) this.settings.urlCache = {};
						this.settings.urlCache[localPath] = folderResult.webViewLink;
						await this.saveSettings();
						return folderResult.id;
					}
					return null;
				};

				const folderId = await getOrCreateFolderRecursive(copyDir);
				if (folderId) {
					newParentFolderId = folderId;
				}
			} else if (origDir === copyDir) {
				// Same directory: try to put the copy under the original file's parent
				const meta = await getFileMetadata(this, originalFileId);
				if (meta && meta.parents && meta.parents.length > 0) {
					newParentFolderId = meta.parents[0];
				}
			}

			// Copy the file on Google Drive
			const current = this.activeCopies.get(file.path);
			if (current) current.status = 'copying';
			this.updateActiveNotice();

			console.log(`[GDrive Duplication Debug] Copying file ${originalFileId} on Google Drive. Parent:`, newParentFolderId);
			const copyResult = await copyFile(this, originalFileId, file.basename, newParentFolderId);
			if (copyResult) {
				// Update local file content with the new URL
				const newUrl = copyResult.webViewLink;
				const fileContent = `${newUrl}\n`;
				await this.app.vault.modify(file, fileContent);

				// Cache the new file's URL
				if (!this.settings.urlCache) this.settings.urlCache = {};
				this.settings.urlCache[file.path] = newUrl;
				await this.saveSettings();

				const current = this.activeCopies.get(file.path);
				if (current) current.status = 'done';
				this.updateActiveNotice();

				console.log(`[GDrive Duplication Debug] Successfully copied file on Google Drive to: ${newUrl}`);

				// Refresh only the File Explorer DOM in the background (no heavy vault reload)
				this.refreshExplorerDomOnly();
				setTimeout(() => this.refreshExplorerDomOnly(), 500);
				setTimeout(() => this.refreshExplorerDomOnly(), 1500);
				setTimeout(() => this.refreshExplorerDomOnly(), 3000);
				setTimeout(() => this.refreshExplorerDomOnly(), 5000);
				this.showReloadModal();
			} else {
				const current = this.activeCopies.get(file.path);
				if (current) {
					current.status = 'failed';
					current.error = 'Google Drive API copy failed';
				}
				this.updateActiveNotice();
			}
		} catch (e: any) {
			console.error('[GDrive Duplication Debug] Error duplicating file/folder:', e);
			const current = this.activeCopies.get(file.path);
			if (current) {
				current.status = 'failed';
				current.error = e.message || String(e);
			}
			this.updateActiveNotice();
			if (e.status === 403 || e.message?.includes('403') || e.message?.includes('permission') || e.message?.includes('scope')) {
				new Notice(`❌ Insufficient Google Drive permissions for "${file.name}". Reconnect account.`);
			} else {
				new Notice(`❌ Error duplicating "${file.name}" on Google Drive: ${e.message || e}`);
			}
		} finally {
			// Clean up processing set after we're done so the file can be modified or copied again later
			setTimeout(() => {
				this.processingCopies.delete(file.path);
			}, 2000);
		}
	}

	private async duplicateGoogleFileViaMenu(file: TFile) {
		const displayFilename = file.name;
		this.activeCopies.set(file.path, {
			sourcePath: file.path,
			destPath: '(generating name...)',
			method: 'Context Menu Duplication',
			status: 'pending'
		});
		this.updateActiveNotice();

		try {
			// Resolve URL
			let originalUrl = this.settings.urlCache?.[file.path];
			if (!originalUrl) {
				const content = await this.app.vault.read(file);
				const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
				if (urlMatch) {
					originalUrl = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
				}
			}
			if (!originalUrl) {
				const adsUrl = await this.tryAutoDetectUrl(file.path);
				if (adsUrl) {
					originalUrl = cleanGoogleUrl(adsUrl, this.settings.urlCleaningRules);
				}
			}
			if (!originalUrl) {
				console.log('[GDrive Context Menu] Searching on Drive by name:', file.basename);
				const searchUrl = await getFileWebViewLink(this, file.basename, file.extension);
				if (searchUrl) {
					originalUrl = searchUrl;
					if (!this.settings.urlCache) this.settings.urlCache = {};
					this.settings.urlCache[file.path] = originalUrl;
					await this.saveSettings();
				}
			}

			if (!originalUrl) {
				throw new Error('Could not resolve Google Drive link for file.');
			}

			const originalFileId = extractGoogleFileId(originalUrl);
			if (!originalFileId) {
				throw new Error('Invalid Google link format.');
			}

			// Generate new local path: e.g., "mAKANAN_001.gdoc"
			const parentPath = file.parent ? file.parent.path : '';
			const { newPath, newBaseName } = this.generateNewSuffixFilename(file.basename, file.extension, parentPath);

			// Update debug status
			const current = this.activeCopies.get(file.path);
			if (current) {
				current.destPath = newPath;
				current.status = 'copying';
			}
			this.updateActiveNotice();

			console.log(
				`%c[GDrive Duplication Debug] CONTEXT MENU DUPLICATE FILE:\n` +
				`- Source: ${file.path}\n` +
				`- Destination: ${newPath}\n` +
				`- Method: Context Menu`,
				'color: #00ffcc; font-weight: bold; font-size: 11px;'
			);

			// Resolve GDrive parent
			let parentId: string | undefined = undefined;
			const meta = await getFileMetadata(this, originalFileId);
			if (meta && meta.parents && meta.parents.length > 0) {
				parentId = meta.parents[0];
			}

			// Copy on cloud
			const copyResult = await copyFile(this, originalFileId, newBaseName, parentId);
			if (!copyResult) {
				throw new Error('Google Drive API copy failed.');
			}

			const newUrl = copyResult.webViewLink;

			// Create local file safely handling virtual stream mounts
			const fileContent = `${newUrl}\n`;
			await this.safeCreateLocalPlaceholder(newPath, fileContent);

			// Cache URL
			if (!this.settings.urlCache) this.settings.urlCache = {};
			this.settings.urlCache[newPath] = newUrl;
			await this.saveSettings();

			const updated = this.activeCopies.get(file.path);
			if (updated) {
				updated.status = 'done';
			}
			this.updateActiveNotice();

			new Notice(`✅ Duplicated "${file.name}" to "${newBaseName}.${file.extension}"`);
			this.refreshExplorerDomOnly();
			this.showReloadModal();
		} catch (e: any) {
			console.error('[GDrive Context Menu] Duplication error:', e);
			const current = this.activeCopies.get(file.path);
			if (current) {
				current.status = 'failed';
				current.error = e.message || String(e);
			}
			this.updateActiveNotice();
			
			if (e.message?.includes('ENOENT') || e.code === 'ENOENT') {
				this.showReloadModal(
					'Reload Vault Now?',
					'Google Drive synced the file, but Obsidian has not indexed it yet. Reload the vault to display it?'
				);
			} else {
				new Notice(`❌ Failed to duplicate "${file.name}": ${e.message || e}`);
			}
		}
	}

	private async duplicateGoogleFolderViaMenu(folder: TFolder) {
		// Generate new folder name, e.g. Folder_001
		const parentPath = folder.parent ? folder.parent.path : '';
		const { newPath: newFolderPath, newFolderName } = this.generateNewSuffixFolderName(folder.name, parentPath);

		// Create local folder
		await this.app.vault.createFolder(newFolderPath);
		new Notice(`📂 Created local folder "${newFolderName}"`);

		// Recurse and copy all children inside
		const recurseCopy = async (currentFolder: TFolder, targetPath: string) => {
			const children = currentFolder.children;
			for (const child of children) {
				if (child instanceof TFile) {
					const ext = child.extension?.toLowerCase();
					if (['gdoc', 'gsheet', 'gform', 'gslides', 'gdraw'].includes(ext)) {
						// Perform GDrive duplication and write into targetPath
						const destFilePath = `${targetPath}/${child.name}`;
						
						this.activeCopies.set(child.path, {
							sourcePath: child.path,
							destPath: destFilePath,
							method: 'Folder Copy Context Menu',
							status: 'pending'
						});
						this.updateActiveNotice();

						try {
							// Resolve URL
							let originalUrl = this.settings.urlCache?.[child.path];
							if (!originalUrl) {
								const content = await this.app.vault.read(child);
								const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
								if (urlMatch) {
									originalUrl = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
								}
							}
							if (!originalUrl) continue; // Skip if we can't find link

							const originalFileId = extractGoogleFileId(originalUrl);
							if (!originalFileId) continue;

							// Resolve or create GDrive folder counterpart
							// We need to create the GDrive folder tree corresponding to targetPath
							const copyDirSegs = targetPath.split('/');
							const chain = await getOriginalFolderChain(this, originalFileId, copyDirSegs.length + 1);
							
							const getOrCreateFolderRecursive = async (localPath: string): Promise<string | null> => {
								if (!localPath) return null;
								const cached = this.settings.urlCache?.[localPath];
								if (cached) {
									const cachedId = extractGoogleFileId(cached);
									if (cachedId) return cachedId;
								}

								const parentLocalPath = localPath.includes('/') ? localPath.substring(0, localPath.lastIndexOf('/')) : '';
								const parentDriveId = await getOrCreateFolderRecursive(parentLocalPath);
								const folderName = localPath.includes('/') ? localPath.split('/').pop() || localPath : localPath;

								let driveParentId: string | undefined = parentDriveId || undefined;
								if (!driveParentId) {
									const localSegs = localPath.split('/');
									const diff = copyDirSegs.length - localSegs.length;
									if (chain && chain[diff + 1]) {
										driveParentId = chain[diff + 1];
									}
								}

								const folderResult = await createFolder(this, folderName, driveParentId);
								if (folderResult) {
									if (!this.settings.urlCache) this.settings.urlCache = {};
									this.settings.urlCache[localPath] = folderResult.webViewLink;
									await this.saveSettings();
									return folderResult.id;
								}
								return null;
							};

							const folderId = await getOrCreateFolderRecursive(targetPath);

							const current = this.activeCopies.get(child.path);
							if (current) current.status = 'copying';
							this.updateActiveNotice();

							const copyResult = await copyFile(this, originalFileId, child.basename, folderId || undefined);
							if (copyResult) {
								const newUrl = copyResult.webViewLink;
								await this.safeCreateLocalPlaceholder(destFilePath, `${newUrl}\n`);
								if (!this.settings.urlCache) this.settings.urlCache = {};
								this.settings.urlCache[destFilePath] = newUrl;
								await this.saveSettings();

								const current = this.activeCopies.get(child.path);
								if (current) current.status = 'done';
								this.updateActiveNotice();
							} else {
								throw new Error('Google Drive copy failed');
							}
						} catch (e: any) {
							console.error('[GDrive Folder Duplication] Error:', e);
							const current = this.activeCopies.get(child.path);
							if (current) {
								current.status = 'failed';
								current.error = e.message || String(e);
							}
							this.updateActiveNotice();
						}
					}
				} else if (child instanceof TFolder) {
					// Create local folder inside target
					const subFolderPath = `${targetPath}/${child.name}`;
					await this.app.vault.createFolder(subFolderPath);
					await recurseCopy(child, subFolderPath);
				}
			}
		};

		await recurseCopy(folder, newFolderPath);
		new Notice(`✅ Duplicated folder structure of "${folder.name}" to "${newFolderName}"`);
		this.refreshExplorerDomOnly();
		this.showReloadModal();
	}

	public showReloadModal(customTitle?: string, customMessage?: string) {
		if (this.isReloadModalOpen) return;
		this.isReloadModalOpen = true;

		const modal = new ReloadVaultModal(this.app, () => {
			this.isReloadModalOpen = false;
			(this.app as any).commands.executeCommandById('app:reload');
		}, customTitle, customMessage);
		
		const originalOnClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			originalOnClose();
			this.isReloadModalOpen = false;
		};
		modal.open();
	}

	private generateNewSuffixFilename(originalBaseName: string, ext: string, parentPath: string): { newPath: string, newBaseName: string } {
		const suffixRegex = /_(\d+)$/;
		const match = originalBaseName.match(suffixRegex);
		
		let prefix = originalBaseName;
		let startCounter = 1;
		
		if (match && match[1] && match.index !== undefined) {
			prefix = originalBaseName.substring(0, match.index);
			startCounter = parseInt(match[1], 10) + 1;
		}

		let counter = startCounter;
		while (true) {
			const suffix = `_${String(counter).padStart(3, '0')}`;
			const candidateName = `${prefix}${suffix}.${ext}`;
			const newPath = parentPath && parentPath !== '/' ? `${parentPath}/${candidateName}` : candidateName;
			
			if (!this.app.vault.getAbstractFileByPath(newPath)) {
				return { newPath, newBaseName: `${prefix}${suffix}` };
			}
			counter++;
		}
	}

	private generateNewSuffixFolderName(originalName: string, parentPath: string): { newPath: string, newFolderName: string } {
		const suffixRegex = /_(\d+)$/;
		const match = originalName.match(suffixRegex);
		
		let prefix = originalName;
		let startCounter = 1;
		
		if (match && match[1] && match.index !== undefined) {
			prefix = originalName.substring(0, match.index);
			startCounter = parseInt(match[1], 10) + 1;
		}

		let counter = startCounter;
		while (true) {
			const suffix = `_${String(counter).padStart(3, '0')}`;
			const candidateName = `${prefix}${suffix}`;
			const newPath = parentPath && parentPath !== '/' ? `${parentPath}/${candidateName}` : candidateName;
			
			if (!this.app.vault.getAbstractFileByPath(newPath)) {
				return { newPath, newFolderName: `${prefix}${suffix}` };
			}
			counter++;
		}
	}

	private async safeCreateLocalPlaceholder(filePath: string, urlContent: string): Promise<void> {
		try {
			await this.app.vault.create(filePath, urlContent);
		} catch (e: any) {
			// Under Google Drive Desktop streaming, creating a .gdoc file can throw ENOENT/EBUSY
			// because the GDrive filesystem driver instantly intercepts and virtualizes the file.
			console.log(`[GDrive Duplication Debug] Vault create threw error for ${filePath}, checking if file exists anyway:`, e.message);
			await new Promise(r => setTimeout(r, 800));
			const checkFile = this.app.vault.getAbstractFileByPath(filePath);
			if (!checkFile) {
				throw e;
			}
			console.log(`[GDrive Duplication Debug] File ${filePath} exists on disk despite the initial error.`);
		}
	}

	private async cleanupOpenedTabsOnLoad(silent = false) {
		const leaves = this.app.workspace.getLeavesOfType(GOOGLE_IFRAME_VIEW_TYPE);
		const invalidLeaves: WorkspaceLeaf[] = [];

		for (const leaf of leaves) {
			const state = leaf.getViewState() as any;
			const filePath = (state.state?.file || state.state?.filePath) as string | undefined;
			let isInvalid = false;
			let reason = '';

			if (!filePath) {
				isInvalid = true;
				reason = 'Tab does not reference any file path.';
			} else {
				const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
				if (!(abstractFile instanceof TFile)) {
					isInvalid = true;
					reason = `Local file "${filePath}" no longer exists in the vault.`;
				} else {
					// Check URL validity
					const url = (state.state?.url || this.settings.urlCache?.[filePath]) as string | undefined;
					if (!url || !url.startsWith('https://docs.google.com/')) {
						isInvalid = true;
						reason = `Tab does not have a valid Google Drive URL.`;
					}
				}
			}

			if (isInvalid) {
				invalidLeaves.push(leaf);
			}
		}

		if (invalidLeaves.length === 0) {
			if (!silent) {
				new Notice('✅ Checked all Google Drive tabs: no orphaned tabs found.');
			}
			return;
		}

		if (!silent) {
			new Notice(`📂 Found ${invalidLeaves.length} orphaned Google Drive tab(s). Reviewing...`);
		}

		// Process them one by one sequentially
		for (const leaf of invalidLeaves) {
			await new Promise<void>((resolve) => {
				const state = leaf.getViewState() as any;
				const title = (state.state?.title || 'Unknown Tab') as string;
				const filePath = (state.state?.file || state.state?.filePath || 'No path') as string;

				const modal = new CleanupTabModal(this.app, title, filePath, () => {
					// User clicked "Close Tab"
					leaf.detach();
					resolve();
				}, () => {
					// User clicked "Keep Open"
					resolve();
				});
				
				// Resolve when modal closes normally
				const originalOnClose = modal.onClose.bind(modal);
				modal.onClose = () => {
					originalOnClose();
					resolve();
				};
				modal.open();
			});
		}
	}

	onunload() {
		const styleEl = document.getElementById('gdrive-dynamic-styles');
		if (styleEl) styleEl.remove();
		// Clean up injected circles
		document.querySelectorAll('.gdrive-icon-circle').forEach(el => el.remove());
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MyPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	refreshDynamicStyles() {
		let styleEl = document.getElementById('gdrive-dynamic-styles');
		if (!styleEl) {
			styleEl = document.createElement('style');
			styleEl.id = 'gdrive-dynamic-styles';
			document.head.appendChild(styleEl);
		}

		const rules = this.settings.colorRules || [];
		let cssContent = '';

		// Base SVG icons per extension (white icons for use on colored circles)
		const docIconB64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTUgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi-yVjdaIi8+PHBhdGggZD0iTTE0IDJ2NGEyIDIgMCAwIDAgMiAyaDQiLz48L3N2Zz4=';
		const showIcons = this.settings.showGoogleWorkspaceIcons !== false;

		for (const rule of rules) {
			const ext = rule.extension.toLowerCase().trim();
			if (!ext) continue;
			const color = rule.color;

			// Hide default SVG icons for this extension
			cssContent += `.nav-file-title[data-path$=".${ext}"] svg,\n` +
				`.nav-file-title[data-path$=".${ext}"] .nav-file-icon { display: none !important; }\n`;

			if (showIcons) {
				// Inject a colored circle as the icon using a data attribute
				cssContent += `.nav-file-title[data-path$=".${ext}"] .gdrive-icon-circle { display: inline-flex !important; }\n`;

				// Define the circle style for this extension
				cssContent += `.gdrive-icon-circle[data-ext="${ext}"] {\n` +
					`  background-color: ${color};\n` +
					`  background-image: url("data:image/svg+xml;base64,${docIconB64}");\n` +
					`  background-repeat: no-repeat;\n` +
					`  background-position: center;\n` +
					`  background-size: 10px;\n` +
					`  width: 18px;\n` +
					`  height: 18px;\n` +
					`  border-radius: 50%;\n` +
					`  flex-shrink: 0;\n` +
					`  display: inline-flex;\n` +
					`  align-items: center;\n` +
					`  justify-content: center;\n` +
					`  margin-right: 4px;\n` +
					`  vertical-align: middle;\n` +
					`}\n`;
			} else {
				// Hide the circle icon entirely
				cssContent += `.nav-file-title[data-path$=".${ext}"] .gdrive-icon-circle { display: none !important; }\n`;
				// Shift the text content to the left
				cssContent += `.nav-file-title[data-path$=".${ext}"] .nav-file-title-content {\n` +
					`  margin-left: 0 !important;\n` +
					`  padding-left: 0 !important;\n` +
					`}\n`;
			}
		}

		if (showIcons) {
			// Layout fix for file titles with our circles
			cssContent += `.nav-file-title:has(.gdrive-icon-circle) {\n` +
				`  display: flex !important;\n` +
				`  align-items: center !important;\n` +
				`}\n`;
		}

		styleEl.textContent = cssContent;

		// DOM injection: add/update colored circle spans in file explorer
		this.injectColorCircles();
	}

	injectColorCircles() {
		if (this.settings.showGoogleWorkspaceIcons === false) {
			document.querySelectorAll('.gdrive-icon-circle').forEach(el => el.remove());
			return;
		}

		const rules = this.settings.colorRules || [];
		if (rules.length === 0) return;

		// Build a map of extension -> color for quick lookup
		const extColorMap: Record<string, string> = {};
		for (const rule of rules) {
			const ext = rule.extension.toLowerCase().trim();
			if (ext) extColorMap[ext] = rule.color;
		}

		// Find all nav-file-title elements in the file explorer
		const allFileTitles = document.querySelectorAll('.nav-file-title[data-path]');
		for (const el of Array.from(allFileTitles)) {
			// Skip elements in rename mode — Obsidian inserts an <input> for inline rename
			// Always remove our circle during rename so the input field is clean
			if (el.querySelector('input')) {
				const existingCircle = el.querySelector('.gdrive-icon-circle');
				if (existingCircle) existingCircle.remove();
				continue;
			}

			const dataPath = el.getAttribute('data-path') || '';
			const dotIdx = dataPath.lastIndexOf('.');
			if (dotIdx === -1) continue;
			const ext = dataPath.slice(dotIdx + 1).toLowerCase();
			if (!extColorMap[ext]) {
				// Remove any existing circle for this element
				const existingCircle = el.querySelector('.gdrive-icon-circle');
				if (existingCircle) existingCircle.remove();
				continue;
			}

			// Check if circle already exists
			let circle = el.querySelector('.gdrive-icon-circle') as HTMLElement | null;
			if (!circle) {
				circle = document.createElement('span');
				circle.className = 'gdrive-icon-circle';
				el.insertBefore(circle, el.firstChild);
			}
			circle.setAttribute('data-ext', ext);
		}
	}

	updateAllTabIcons() {
		const leaves = this.app.workspace.getLeavesOfType(GOOGLE_IFRAME_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as any;
			if (view && typeof view.updateTabIcon === 'function') {
				view.updateTabIcon();
			}
		}
	}

	public refreshExplorerDomOnly() {
		try {
			const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
			if (fileExplorer && fileExplorer.view) {
				(fileExplorer.view as any).requestDOMUpdate?.();
			}
			this.injectColorCircles();
		} catch (e) {
			console.warn('[GDrive] Failed to refresh explorer DOM:', e);
		}
	}

	public refreshVaultAndExplorer() {
		try {
			if (typeof (this.app.vault as any).refresh === 'function') {
				(this.app.vault as any).refresh();
			}
			this.refreshExplorerDomOnly();
		} catch (e) {
			console.warn('[GDrive] Failed to refresh vault/explorer:', e);
		}
	}

	private updateActiveNotice() {
		if (this.activeCopies.size === 0) {
			if (this.activeNotice) {
				this.activeNotice.hide();
				this.activeNotice = null;
			}
			return;
		}

		let message = '📂 Google Drive Duplication Status:\n';
		let allDone = true;
		this.activeCopies.forEach((info) => {
			let statusStr = '⏳ Pending';
			if (info.status === 'copying') {
				statusStr = '🔄 Copying...';
				allDone = false;
			} else if (info.status === 'done') {
				statusStr = '✅ Done';
			} else if (info.status === 'failed') {
				statusStr = '❌ Failed';
				if (info.error) {
					statusStr += ` (${info.error})`;
				}
			} else {
				allDone = false;
			}
			// Extract filenames for clean display
			const srcName = info.sourcePath.split('/').pop() || info.sourcePath;
			const destName = info.destPath.split('/').pop() || info.destPath;
			message += `• ${srcName} ➡️ ${destName}\n  Status: ${statusStr} (via ${info.method})\n`;
		});

		if (!this.activeNotice) {
			this.activeNotice = new Notice(message, 0);
		} else {
			this.activeNotice.setMessage(message);
		}

		if (allDone) {
			setTimeout(() => {
				let stillAllDone = true;
				this.activeCopies.forEach((info) => {
					if (info.status === 'copying' || info.status === 'pending') stillAllDone = false;
				});
				if (stillAllDone) {
					this.activeNotice?.hide();
					this.activeNotice = null;
					this.activeCopies.clear();
				}
			}, 4000);
		}
	}
}

/* ---------------------------------------------------------------
   Sample modal – unchanged from the starter template
   --------------------------------------------------------------- */
class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ReloadVaultModal extends Modal {
	private onReload: () => void;
	private customTitle?: string;
	private customMessage?: string;

	constructor(app: App, onReload: () => void, customTitle?: string, customMessage?: string) {
		super(app);
		this.onReload = onReload;
		this.customTitle = customTitle;
		this.customMessage = customMessage;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h3', { text: this.customTitle || 'Duplication Completed!' });
		contentEl.createEl('p', { 
			text: this.customMessage || 'The files have been successfully duplicated on Google Drive and created locally in your vault.' 
		});
		contentEl.createEl('p', {
			text: 'Since your vault is on a Google Drive virtual drive (J:), Obsidian needs a quick reload to display the new files in the explorer.'
		});

		const buttonContainer = contentEl.createDiv({ cls: 'gdrive-modal-buttons' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '20px';

		const laterBtn = buttonContainer.createEl('button', { text: 'Later' });
		laterBtn.addEventListener('click', () => this.close());

		const reloadBtn = buttonContainer.createEl('button', { 
			text: 'Reload Now', 
			cls: 'mod-cta' 
		});
		reloadBtn.addEventListener('click', () => {
			this.close();
			this.onReload();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class CleanupTabModal extends Modal {
	private tabTitle: string;
	private filePath: string;
	private onCloseTab: () => void;
	private onKeepOpen: () => void;
	private isResolved = false;

	constructor(app: App, tabTitle: string, filePath: string, onCloseTab: () => void, onKeepOpen: () => void) {
		super(app);
		this.tabTitle = tabTitle;
		this.filePath = filePath;
		this.onCloseTab = onCloseTab;
		this.onKeepOpen = onKeepOpen;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Cleanup Orphaned Tab' });
		contentEl.createEl('p', {
			text: `We detected an invalid or orphaned Google Drive tab:`
		});
		
		const card = contentEl.createDiv();
		card.style.background = 'var(--background-secondary)';
		card.style.padding = '12px';
		card.style.borderRadius = '6px';
		card.style.marginBottom = '15px';
		card.style.border = '1px solid var(--border-color)';
		
		card.createEl('div', { text: `Title: ${this.tabTitle}`, attr: { style: 'font-weight: bold;' } });
		card.createEl('div', { text: `Path: ${this.filePath}`, attr: { style: 'font-size: 0.9em; color: var(--text-muted); margin-top: 4px;' } });
		
		contentEl.createEl('p', {
			text: 'This tab no longer corresponds to an existing file in your vault, or has an invalid URL. Would you like to close it?'
		});

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '20px';

		const keepBtn = buttonContainer.createEl('button', { text: 'Keep Open' });
		keepBtn.addEventListener('click', () => {
			this.isResolved = true;
			this.close();
			this.onKeepOpen();
		});

		const closeBtn = buttonContainer.createEl('button', {
			text: 'Close Tab',
			cls: 'mod-warning'
		});
		closeBtn.addEventListener('click', () => {
			this.isResolved = true;
			this.close();
			this.onCloseTab();
		});
	}

	onClose() {
		this.contentEl.empty();
		if (!this.isResolved) {
			this.onKeepOpen();
		}
	}
}
