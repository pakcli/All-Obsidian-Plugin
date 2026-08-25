import { FileSystemAdapter, Menu, Notice, Platform, Plugin, TAbstractFile, TFile, TFolder, MarkdownView } from 'obsidian';
import { BadgeRenderer } from './features/symlink/badges';
import { SymlinkModal } from './features/symlink/modal';
import { reindexVaultFolder } from './features/symlink/reindex';
import { DatePickerModal } from './features/symlink/datePickerModal';
import { DEFAULT_SETTINGS, PakCLIPluginSettings, PakCLISettingTab } from './settings';
import { SymlinkManagerSettingTab } from './features/symlink/settings';

// SQLSeal & CSV Editor Imports
import { mainModule } from './features/sqlseal/modules/main/module';
import { SQLSealSettingsTab } from './features/sqlseal/modules/settings/SQLSealSettingsTab';
import { ColumnConfig } from './features/sqlseal/types';
import { CsvView, CSV_VIEW_TYPE } from './features/sqlseal/csv-view';

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

// Asset Draggable
import { AttachmentDragHandler } from './features/attachmentDrag/AttachmentDragHandler';

// Folder Sync Manager & Two-Section Codeblock
import { SyncManager } from './features/scriptSync/SyncManager';
import { SyncCodeblockRenderer } from './features/scriptSync/ui/SyncCodeblockRenderer';
import { PendingChangesModal } from './features/scriptSync/ui/PendingChangesModal';
import { ScanSyncModal } from './features/scriptSync/ui/ScanSyncModal';
import { extractFirstCodeBlock } from './features/scriptSync/markdownParser';

// Save Vault (Profiles) Manager
import { ProfileManager } from './features/profiles/ProfileManager';
import { CreateProfileModal, QuickSwitchProfileModal, ProfileManagerModal } from './features/profiles/ui/ProfileModals';

export default class PakCLIPlugin extends Plugin {
	settings!: PakCLIPluginSettings;
	profileManager!: ProfileManager;
    
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

	// Asset Draggable
	private assetDragHandler: AttachmentDragHandler | null = null;

	// Folder Sync Manager
	syncManager!: SyncManager;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.profileManager.onProfileSwitched(() => {
			this.applyCodeblockStyle();
			this.applyBadgeSetting();
			this.syncManager?.init();
		});

		this.codeblockScaler = new CodeblockScaler(this);
		this.codeblockScaler.init();

		this.registerCodeblockProcessors();

		this.applyCodeblockStyle();

		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			this.vaultRoot = adapter.getBasePath();
		} else {
			this.vaultRoot = '';
		}

		// =========================================================================
		// 1. Initialize SQLSeal
		// =========================================================================
		let sqlsealTabInstance: SQLSealSettingsTab | null = null;
		try {
			const container = mainModule.build({
				'obsidian.app': (d: { value: (v: unknown) => unknown }) => d.value(this.app),
				'obsidian.plugin': (d: { value: (v: unknown) => unknown }) => d.value(this),
				'obsidian.vault': (d: { value: (v: unknown) => unknown }) => d.value(this.app.vault)
			} as unknown as Parameters<typeof mainModule.build>[0]);

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
		if (Platform.isDesktop && this.vaultRoot) {
			this.badges = new BadgeRenderer(this.app, this.vaultRoot);

			this.addCommand({
				id: 'manage-active-folder',
				name: 'Manage symlink for active folder',
				callback: () => this.openModalForVaultPath(''),
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
					menu.addItem((item) =>
						item
							.setTitle('Symlink: re-scan / index folder')
							.setIcon('refresh-cw')
							.onClick(async () => {
								new Notice(`Scanning and indexing "${file.path}"…`);
								await reindexVaultFolder(this.app, file.path);
								new Notice(`Indexed "${file.path}".`);
							})
					);
				})
			);

			this.app.workspace.onLayoutReady(() => this.applyBadgeSetting());

			this.registerEvent(this.app.vault.on('create', (f) => this.badges?.notify(f)));
			this.registerEvent(this.app.vault.on('delete', (f) => this.badges?.notify(f)));
			this.registerEvent(this.app.vault.on('rename', (f) => this.badges?.notify(f)));
		}
		
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

				if (isRenameInput && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) {
					const formatted = this.formatDate(today, this.settings.dateFormat);
					const start = activeEl.selectionStart ?? 0;
					const end = activeEl.selectionEnd ?? 0;
					activeEl.setRangeText(formatted, start, end, 'end');
					activeEl.dispatchEvent(new Event('input', { bubbles: true }));
					return;
				}

				// 2. Capture selection and show date picker modal for non-destructive elements (editor, title, etc)
				let selectionRange: Range | null = null;
				let inputSelection: { start: number; end: number } | null = null;

				if (activeEl) {
					if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
						const textInput = activeEl;
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

						if (inputSelection && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) {
							activeEl.setRangeText(formatted, inputSelection.start, inputSelection.end, 'end');
							activeEl.dispatchEvent(new Event('input', { bubbles: true }));
						} else if (selectionRange && activeEl.isContentEditable) {
							selectionRange.deleteContents();
							const textNode = document.createTextNode(formatted);
							selectionRange.insertNode(textNode);
							selectionRange.setStartAfter(textNode);
							selectionRange.setEndAfter(textNode);
							const selection = window.getSelection();
							if (selection) {
								selection.removeAllRanges();
								selection.addRange(selectionRange);
							}
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

		if (Platform.isDesktop) {
			window.setTimeout(() => runYTCaptureStartupCheck(this.settings), 2000);
		}

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

		// =========================================================================
		// 8. Initialize Asset Draggable
		// =========================================================================
		if (this.settings.enableAssetDrag !== false) {
			this.assetDragHandler = new AttachmentDragHandler(this.app, this.vaultRoot);
			this.assetDragHandler.register(this);
		}

		// =========================================================================
		// 9. Initialize Folder Sync Manager
		// =========================================================================
		this.syncManager = new SyncManager(
			this.app,
			this,
			() => this.settings,
			() => this.saveSettings()
		);
		this.syncManager.init();

		// Left Ribbon Icon: Quick Scan & Dashboard
		this.addRibbonIcon('terminal', 'Codeblock Sync: Scan & Sync Dashboard', () => {
			new ScanSyncModal(
				this.app,
				this.syncManager,
				() => this.settings,
				() => this.saveSettings()
			).open();
		});

		this.addCommand({
			id: 'codeblock-sync-scan-modal',
			name: 'Codeblock Sync: Scan Vault Notes & Open Dashboard',
			callback: () => {
				new ScanSyncModal(
					this.app,
					this.syncManager,
					() => this.settings,
					() => this.saveSettings()
				).open();
			}
		});

		this.addCommand({
			id: 'codeblock-sync-all-instant',
			name: 'Codeblock Sync: Instant Sync All Notes to Scripts',
			callback: async () => {
				new Notice('Codeblock Sync: Scanning and syncing all notes...');
				const allFiles = this.app.vault.getMarkdownFiles();
				const settings = this.settings;
				const managerRoot = settings.managerRootFolder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
				let count = 0;

				for (const file of allFiles) {
					const normPath = file.path.replace(/\\/g, '/');
					if (managerRoot && !normPath.startsWith(managerRoot)) continue;

					try {
						const content = await this.app.vault.read(file);
						const extracted = extractFirstCodeBlock(content);
						if (extracted && extracted.code.trim()) {
							const ok = await this.syncManager.executeSync(file, 'manager_to_cli', extracted.code, extracted.language);
							if (ok) count++;
						}
					} catch {
						// Ignore read / parse errors for non-matching notes
					}
				}
				new Notice(`✓ Codeblock Sync: Synced ${count} script files.`);
			}
		});

		this.addCommand({
			id: 'codeblock-sync-open-pending',
			name: 'Codeblock Sync: Open Pending Changes',
			callback: () => {
				new PendingChangesModal(
					this.app,
					this.syncManager,
					() => this.settings,
					() => this.saveSettings()
				).open();
			}
		});

		this.addCommand({
			id: 'codeblock-sync-sync-active',
			name: 'Codeblock Sync: Sync active note script to file',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.syncManager.executeSync(activeFile, 'manager_to_cli');
				} else {
					new Notice('No active note to sync.');
				}
			}
		});

		this.addCommand({
			id: 'codeblock-sync-pull-active',
			name: 'Codeblock Sync: Pull active note script from file',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.syncManager.executeSync(activeFile, 'cli_to_manager');
				} else {
					new Notice('No active note to pull.');
				}
			}
		});

		// Save Vault: Multi-Profile commands
		this.addCommand({
			id: 'save-vault-switch-profile',
			name: 'Save Vault: Switch profile / save slot',
			callback: () => {
				new QuickSwitchProfileModal(this.app, this.profileManager).open();
			},
		});

		this.addCommand({
			id: 'save-vault-create-slot',
			name: 'Save Vault: Save current state as new slot',
			callback: () => {
				new CreateProfileModal(this.app, this.profileManager).open();
			},
		});

		this.addCommand({
			id: 'save-vault-open-manager',
			name: 'Save Vault: Open save slots manager modal',
			callback: () => {
				new ProfileManagerModal(this.app, this, this.profileManager).open();
			},
		});

		// =========================================================================
		// 10. Register CSV & TSV Table Editor View (Tablite Editor)
		// =========================================================================
		this.registerView(
			CSV_VIEW_TYPE,
			(leaf) => new CsvView(leaf, this as any)
		);
		this.registerExtensions(['csv', 'tsv'], CSV_VIEW_TYPE);

		this.addCommand({
			id: 'tablite-csv-open-editor',
			name: 'CSV Editor: Open Active File in Table Editor',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				const isCsv = activeFile && (activeFile.extension === 'csv' || activeFile.extension === 'tsv');
				if (isCsv) {
					if (!checking) {
						const leaf = this.app.workspace.getLeaf(false);
						leaf.setViewState({
							type: CSV_VIEW_TYPE,
							state: { file: activeFile.path }
						});
					}
					return true;
				}
				return false;
			}
		});

		new Notice('PakCLI Editor\'s Choice Loaded');
	}

	onunload(): void {
		this.badges?.clearAll();
		this.badges = null;

		this.assetDragHandler = null;
		this.syncManager?.destroy();

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
		// 1. Two-Section Script Sync Processors (powershell, gitbash, bash, cmd, python, etc.)
		const scriptLangs = [
			'powershell', 'ps1', 'pwsh',
			'cmd', 'bat', 'batch', 'dos',
			'bash', 'sh', 'gitbash', 'zsh', 'shell',
			'python', 'py',
			'javascript', 'js',
			'typescript', 'ts',
			'sql',
			'sync-script', 'script'
		];

		scriptLangs.forEach((lang) => {
			try {
				this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
					const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
					const noteFile = file instanceof TFile ? file : null;
					const renderer = new SyncCodeblockRenderer(el, source, lang, this.syncManager, this, noteFile);
					ctx.addChild(renderer);
				});
			} catch {
				// Ignore if already registered
			}
		});

		// 2. ASCII & Custom Scaler Codeblocks
		const defaultLangs = ['asci', 'ascii', 'scalefit', 'flowclip'];
		const customRules = this.settings.codeblockLanguageRules || [];
		const langsToRegister = new Set([
			...defaultLangs,
			...customRules.map((r) => r.language.trim().toLowerCase()).filter(Boolean),
		]);

		langsToRegister.forEach((lang) => {
			if (scriptLangs.includes(lang)) return; // Don't override script sync

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
	// Shared Settings & Profile Management
	// =========================================================================
	async loadSettings(): Promise<void> {
		if (!this.profileManager) {
			this.profileManager = new ProfileManager(this);
		}
		const rawData = await this.loadData();
		this.settings = await this.profileManager.init(rawData);
	}

	async saveSettings(): Promise<void> {
		if (this.profileManager) {
			await this.profileManager.saveActiveSlotData(this.settings);
		} else {
			await super.saveData(this.settings);
		}
		this.applyCodeblockStyle();
	}

	async saveData(data: unknown): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, this.settings || {}, (data as Partial<PakCLIPluginSettings>) || {});
		if (this.profileManager) {
			await this.profileManager.saveActiveSlotData(this.settings);
		} else {
			await super.saveData(this.settings);
		}
		this.applyCodeblockStyle();
	}

	async saveRawStorage(storage: unknown): Promise<void> {
		await super.saveData(storage);
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
