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
import GoogleIframeView, { GOOGLE_IFRAME_VIEW_TYPE, cleanGoogleUrl, urlsMatch } from './googleIframeView';
import BookmarksView, { BOOKMARKS_VIEW_TYPE } from './bookmarksView';

export default class MyPlugin extends Plugin {
	// Map to keep a single leaf per Google file
	private openLeavesMap: Map<string, WorkspaceLeaf> = new Map();

	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

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
	}

	private async openBookmarksPanel() {
		// Reuse existing panel if open
		const existing = this.app.workspace.getLeavesOfType(BOOKMARKS_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]!);
			return;
		}
		// Open in right sidebar
		const leaf = this.app.workspace.getRightLeaf(false);
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
		const rawUrl = cleanGoogleUrl(urlMatch[0]);
		console.log('[GDrive] rawUrl:', rawUrl);

		// Re‑use an existing leaf if the file is already open
		const existingLeaf = this.openLeavesMap.get(file.path);
		if (existingLeaf) {
			const view = existingLeaf.view as any;
			if (view && typeof view.getCurrentUrl === 'function') {
				const currentUrl = view.getCurrentUrl();
				if (urlsMatch(currentUrl, rawUrl)) {
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

	onunload() { }

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
