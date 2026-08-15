import { FileSystemAdapter, Menu, Notice, Plugin, TAbstractFile, TFolder, MarkdownView } from 'obsidian';
import { BadgeRenderer } from './features/symlink/badges';
import { SymlinkModal } from './features/symlink/modal';
import { DatePickerModal } from './features/symlink/datePickerModal';
import { DEFAULT_SETTINGS, PakCLIPluginSettings, PakCLISettingTab } from './settings';
import { SymlinkManagerSettingTab } from './features/symlink/settings';

// SQLSeal Imports
import { mainModule } from './features/sqlseal/modules/main/module';
import { SQLSealSettingsTab } from './features/sqlseal/modules/settings/SQLSealSettingsTab';
import { ColumnConfig } from './features/sqlseal/types';

// Leaflet Imports
import { BasesLeafletViewPlugin } from './features/leaflet/plugin';
import { BasesLeafletViewSettingsTab } from './features/leaflet/settings/basesLeafletViewSettingsTab';

// Tree Diagram / Asset Router Imports
import { AssetRouter } from './features/tree/router';
import { DiagramRenderer } from './features/tree/renderers/DiagramRenderer';
import { registerCommands as registerTreeCommands } from './features/tree/commands/index';

// Docmost Sync Imports
import { DocmostSyncManager } from './features/docmost/docmost-sync';

// Codeblock Auto-Scaler
import { CodeblockScaler, renderAsciiSvg } from './features/codeblock/scaler';

// YT Evidence Capture Imports
import { CaptureModal as YTCaptureModal } from './features/ytcapture/ui/CaptureModal';
import { runYTCaptureStartupCheck } from './features/ytcapture/utils/healthCheck';

export default class PakCLIPlugin extends Plugin {
	settings!: PakCLIPluginSettings;
    
	// Symlink Manager properties
	private badges: BadgeRenderer | null = null;
	private vaultRoot = '';

	// Leaflet properties
	leafletPlugin!: BasesLeafletViewPlugin;

	// Tree Diagram / Asset Router properties
	settingsPanelStates: Map<string, boolean> = new Map();
	router!: AssetRouter;

	// Codeblock Scaler
	codeblockScaler!: CodeblockScaler;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.codeblockScaler = new CodeblockScaler(this);
		this.codeblockScaler.init();

		this.registerCodeblockProcessors();

		this.applyCodeblockStyle();

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice('PakCLI: this plugin only runs on Obsidian desktop.');
			return;
		}
		this.vaultRoot = adapter.getBasePath();

		// =========================================================================
		// 1. Initialize SQLSeal
		// =========================================================================
		let sqlsealTabInstance: SQLSealSettingsTab | null = null;
		try {
			const container = mainModule.build({
				'obsidian.app': this.app,
				'obsidian.plugin': this,
				'obsidian.vault': this.app.vault
			});

			const init = await container.get('init');
			init();

			sqlsealTabInstance = await container.get('settings.settingsTab');
		} catch (err) {
			console.error('[PakCLI] Failed to initialize SQLSeal:', err);
		}

		// =========================================================================
		// 2. Initialize Leaflet Maps
		// =========================================================================
		this.leafletPlugin = new BasesLeafletViewPlugin(this.app, this.manifest);
		await this.leafletPlugin.onload();
		const leafletTabInstance = new BasesLeafletViewSettingsTab(this.leafletPlugin, this.leafletPlugin.settingsManager);

		// =========================================================================
		// 3. Initialize Symlink Manager & Date Picker
		// =========================================================================
		this.badges = new BadgeRenderer(this.app, this.vaultRoot);

		this.addCommand({
			id: 'manage-active-folder',
			name: 'Manage symlink for active folder',
			callback: () => this.openModalForVaultPath(''),
		});

		this.addCommand({
			id: 'insert-date-picker',
			name: 'Insert date from picker',
			callback: () => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				const today = new Date();
				const yyyy = String(today.getFullYear());
				const mm = String(today.getMonth() + 1).padStart(2, '0');
				const dd = String(today.getDate()).padStart(2, '0');
				const defaultDateStr = `${yyyy}-${mm}-${dd}`;

				const activeEl = document.activeElement as HTMLElement | null;

				// 1. If we are in the file explorer rename input, insert today's date immediately.
				// This is because opening a modal triggers a blur event on the rename input, 
				// which tells Obsidian to immediately destroy/commit the rename element before we can choose a date.
				const isRenameInput = activeEl && (
					activeEl.classList.contains('nav-file-input') || 
					activeEl.classList.contains('nav-folder-input') ||
					activeEl.closest('.nav-file') !== null ||
					activeEl.closest('.nav-folder') !== null
				) && (activeEl.instanceOf?.(HTMLInputElement) || activeEl.tagName === 'INPUT');

				if (isRenameInput) {
					const formatted = this.formatDate(today, this.settings.dateFormat);
					document.execCommand('insertText', false, formatted);
					return;
				}

				// 2. Capture selection and show date picker modal for non-destructive elements (editor, title, etc)
				let selectionRange: Range | null = null;
				let inputSelection: { start: number; end: number } | null = null;

				if (activeEl) {
					if (activeEl.instanceOf?.(HTMLInputElement) || activeEl.instanceOf?.(HTMLTextAreaElement) || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
						const textInput = activeEl as HTMLInputElement | HTMLTextAreaElement;
						inputSelection = {
							start: textInput.selectionStart ?? 0,
							end: textInput.selectionEnd ?? 0
						};
					} else if (activeEl.isContentEditable) {
						const selection = window.getSelection();
						if (selection && selection.rangeCount > 0) {
							selectionRange = selection.getRangeAt(0).cloneRange();
						}
					}
				}

				new DatePickerModal(this.app, defaultDateStr, (selectedDateStr: string) => {
					const parts = selectedDateStr.split('-');
					const year = parseInt(parts[0] ?? '', 10);
					const month = parseInt(parts[1] ?? '', 10) - 1;
					const day = parseInt(parts[2] ?? '', 10);
					const date = new Date(year, month, day);
					const formatted = this.formatDate(date, this.settings.dateFormat);

					if (activeEl) {
						activeEl.focus(); // Restore focus first

						if (inputSelection && (activeEl.instanceOf?.(HTMLInputElement) || activeEl.instanceOf?.(HTMLTextAreaElement) || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
							(activeEl as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(inputSelection.start, inputSelection.end);
							document.execCommand('insertText', false, formatted);
						} else if (selectionRange && activeEl.isContentEditable) {
							const selection = window.getSelection();
							if (selection) {
								selection.removeAllRanges();
								selection.addRange(selectionRange);
							}
							document.execCommand('insertText', false, formatted);
						} else if (activeView && activeView.editor) {
							const editor = activeView.editor;
							editor.replaceRange(formatted, editor.getCursor());
						}
					} else if (activeView && activeView.editor) {
						const editor = activeView.editor;
						editor.replaceRange(formatted, editor.getCursor());
					} else {
						new Notice("No input field was focused to insert date.");
					}
				}).open();
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle('Symlink: manage this folder')
						.setIcon('link')
						.onClick(() => this.openModalForVaultPath(file.path))
				);
			})
		);

		this.app.workspace.onLayoutReady(() => this.applyBadgeSetting());

		this.registerEvent(this.app.vault.on('create', (f) => this.badges?.notify(f)));
		this.registerEvent(this.app.vault.on('delete', (f) => this.badges?.notify(f)));
		this.registerEvent(this.app.vault.on('rename', (f) => this.badges?.notify(f)));

		const symlinkTabInstance = new SymlinkManagerSettingTab(
			this.app,
			this,
			this.settings,
			() => this.saveSettings(),
			() => this.applyBadgeSetting()
		);

		// =========================================================================
		// 4. Initialize Tree Diagram & Asset Router
		// =========================================================================
		this.router = new AssetRouter(this.app, () => this.settings);
		this.router.registerEvents(this);

		this.registerMarkdownCodeBlockProcessor("tree", async (source, el, ctx) => {
			ctx.addChild(new DiagramRenderer(this, source, el, ctx));
		});

		registerTreeCommands(this);

		// =========================================================================
		// 5. Initialize Docmost Sync Engine
		// =========================================================================
		const docmostSync = new DocmostSyncManager(this.app, this);
		if (this.settings.docmostServerUrl && this.settings.docmostToken) {
			docmostSync.setServer(this.settings.docmostServerUrl, this.settings.docmostToken);
		}

		this.addCommand({
			id: 'docmost-sync-active-note',
			name: 'Docmost: Sync active note to Docmost',
			callback: async () => {
				if (!this.settings.docmostSpaceId) {
					new Notice('Docmost: Please set Space ID in plugin settings first.');
					return;
				}
				docmostSync.setServer(this.settings.docmostServerUrl, this.settings.docmostToken);
				await docmostSync.syncCurrentNote(this.settings.docmostSpaceId);
			},
		});

		this.addCommand({
			id: 'docmost-pull-space-notes',
			name: 'Docmost: Pull space notes from Docmost into Vault',
			callback: async () => {
				if (!this.settings.docmostSpaceId) {
					new Notice('Docmost: Please set Space ID in plugin settings first.');
					return;
				}
				docmostSync.setServer(this.settings.docmostServerUrl, this.settings.docmostToken);
				await docmostSync.pullSpaceNotes(
					this.settings.docmostSpaceId,
					this.settings.docmostVaultSyncDir || ''
				);
			},
		});

		// =========================================================================
		// 6. Initialize YT Extension
		// =========================================================================
		this.addRibbonIcon('film', 'yt extension menu', () => {
			new YTCaptureModal(this.app, this).open();
		});

		this.addCommand({
			id: 'yt-extension-open-modal',
			name: 'YT Extension: Capture YouTube video clip',
			callback: () => {
				new YTCaptureModal(this.app, this).open();
			},
		});

		window.setTimeout(() => runYTCaptureStartupCheck(this.settings), 2000);

		// =========================================================================
		// 7. Register Settings Tab
		// =========================================================================
		this.addSettingTab(new PakCLISettingTab(
			this.app, 
			this, 
			symlinkTabInstance, 
			sqlsealTabInstance, 
			leafletTabInstance
		));

		new Notice('PakCLI Editor\'s Choice Loaded');
	}

	onunload(): void {
		this.badges?.clearAll();
		this.badges = null;

		document.body.classList.remove('codeblock-flowclip', 'codeblock-wrap', 'codeblock-scalefit');

		if (this.codeblockScaler) {
			this.codeblockScaler.destroy();
		}

		if (this.leafletPlugin) {
			this.leafletPlugin.onunload();
		}
	}

	applyCodeblockStyle(): void {
		document.body.classList.remove('codeblock-flowclip', 'codeblock-wrap', 'codeblock-scalefit');
		const mode = this.settings.codeblockWrapMode || 'flowclip';
		document.body.classList.add(`codeblock-${mode}`);
		this.codeblockScaler?.rescaleAll();
	}

	registerCodeblockProcessors(): void {
		const defaultLangs = ['asci', 'ascii', 'scalefit', 'flowclip'];
		const customRules = this.settings.codeblockLanguageRules || [];
		const langsToRegister = new Set([
			...defaultLangs,
			...customRules.map((r) => r.language.trim().toLowerCase()).filter(Boolean),
		]);

		langsToRegister.forEach((lang) => {
			try {
				this.registerMarkdownCodeBlockProcessor(lang, (source, el) => {
					const scaler = this.codeblockScaler;
					const behavior = scaler ? scaler.getBehaviorForLanguage(lang) : 'scalefit';

					if (behavior === 'scalefit') {
						renderAsciiSvg(source, el);
					} else if (behavior === 'wrap') {
						el.empty();
						const pre = el.createEl('pre', { cls: 'pakcli-codeblock pakcli-codeblock-wrap' });
						const code = pre.createEl('code');
						code.textContent = source;
					} else {
						el.empty();
						const pre = el.createEl('pre', { cls: 'pakcli-codeblock pakcli-codeblock-flowclip' });
						const code = pre.createEl('code');
						code.textContent = source;
					}
				});
			} catch {
				// Ignore if already registered
			}
		});
	}

	// =========================================================================
	// Symlink Manager Methods
	// =========================================================================
	openModalForVaultPath(initialVaultPath: string): void {
		if (!this.vaultRoot) {
			new Notice('Symlink Manager: vault root unavailable.');
			return;
		}
		new SymlinkModal(this.app, {
			vaultRoot: this.vaultRoot,
			initialVaultPath,
			confirmDisconnect: this.settings.confirmDisconnect,
			onChange: () => this.badges?.scheduleRefresh(50),
		}).open();
	}

	applyBadgeSetting(): void {
		if (!this.badges) return;
		if (this.settings.showBadges) this.badges.scheduleRefresh(0);
		else this.badges.clearAll();
	}

	// =========================================================================
	// SQLSeal Config Methods
	// =========================================================================
	getFileColumnConfig(filePath: string, columnCount: number): ColumnConfig {
		const files = (this.settings.files || {}) as Record<string, ColumnConfig>;
		const config = files[filePath];
		if (config) return config;
		const defaultOrder = Array.from({ length: columnCount }, (_, i) => i);
		return {
			order: defaultOrder,
			hidden: [],
			sizing: {},
			frozenCount: 0,
		};
	}

	async setFileColumnConfig(filePath: string, columnCount: number, config: ColumnConfig): Promise<void> {
		if (!this.settings.files) {
			this.settings.files = {};
		}
		this.settings.files[filePath] = config;
		await this.saveSettings();
	}

	// =========================================================================
	// Shared Settings Management
	// =========================================================================
	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<PakCLIPluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.applyCodeblockStyle();
	}

	async saveData(data: unknown): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, this.settings || {}, (data as Partial<PakCLIPluginSettings>) || {});
		await super.saveData(this.settings);
		this.applyCodeblockStyle();
	}

	formatDate(date: Date, format: string): string {
		const yyyy = String(date.getFullYear());
		const yy = yyyy.slice(-2);
		const mm = String(date.getMonth() + 1).padStart(2, '0');
		const m = String(date.getMonth() + 1);
		const dd = String(date.getDate()).padStart(2, '0');
		const d = String(date.getDate());

		return format
			.replace(/{yyyy}/g, yyyy)
			.replace(/{yy}/g, yy)
			.replace(/{mm}/g, mm)
			.replace(/{m}/g, m)
			.replace(/{dd}/g, dd)
			.replace(/{d}/g, d);
	}
}
