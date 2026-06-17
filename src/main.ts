import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	WorkspaceLeaf,
	TFile,
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
} from './googleIframeView';
import BookmarksView, { BOOKMARKS_VIEW_TYPE } from './bookmarksView';

export default class MyPlugin extends Plugin {
	// Map to keep a single leaf per Google file
	private openLeavesMap: Map<string, WorkspaceLeaf> = new Map();

	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		this.refreshDynamicStyles();

		// Listen for file‑open events (click in file explorer)
		this.registerEvent(
			this.app.workspace.on('file-open', this.handleFileOpen.bind(this)),
		);
		// Register custom iframe view for Google embeds
		this.registerView(GOOGLE_IFRAME_VIEW_TYPE, (leaf) => new GoogleIframeView(leaf, this));
    // Make Obsidian open .gdoc etc. with our custom view
    this.registerExtensions(['gdoc','gsheet','gform','gslides','gdraw'], GOOGLE_IFRAME_VIEW_TYPE);

		// Register Chrome Bookmarks sidebar
		this.registerView(BOOKMARKS_VIEW_TYPE, (leaf) => new BookmarksView(leaf, this));

		// Ribbon icon — opens the bookmarks panel
		this.addRibbonIcon('bookmark', 'Open bookmarks', () => this.openBookmarksPanel());

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		this.addCommand({
			id: 'open-bookmarks-panel',
			name: 'Open bookmarks panel',
			callback: () => this.openBookmarksPanel(),
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

		// Extract the Google URL from the file contents
		const content = await this.app.vault.read(file);
		console.log('[GDrive] file content:', content.substring(0, 200));
		const urlMatch = content.match(/https:\/\/docs\.google\.com\/[^\s)]+/);
		console.log('[GDrive] urlMatch:', urlMatch);
		if (!urlMatch) {
			new Notice('No Google URL found in the file.');
			return;
		}
		const rawUrl = cleanGoogleUrl(urlMatch[0], this.settings.urlCleaningRules);
		console.log('[GDrive] rawUrl:', rawUrl);

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
		const docIconB64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTUgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjdaIi8+PHBhdGggZD0iTTE0IDJ2NGEyIDIgMCAwIDAgMiAyaDQiLz48L3N2Zz4=';

		for (const rule of rules) {
			const ext = rule.extension.toLowerCase().trim();
			if (!ext) continue;
			const color = rule.color;

			// Hide default SVG icons for this extension
			cssContent += `.nav-file-title[data-path$=".${ext}"] svg,\n` +
				`.nav-file-title[data-path$=".${ext}"] .nav-file-icon { display: none !important; }\n`;

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
		}

		// Layout fix for file titles with our circles
		cssContent += `.nav-file-title:has(.gdrive-icon-circle) {\n` +
			`  display: flex !important;\n` +
			`  align-items: center !important;\n` +
			`}\n`;

		styleEl.textContent = cssContent;

		// DOM injection: add/update colored circle spans in file explorer
		this.injectColorCircles();
	}

	injectColorCircles() {
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
