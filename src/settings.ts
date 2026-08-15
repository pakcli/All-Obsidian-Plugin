import { App, PluginSettingTab, Setting, ButtonComponent, Notice, normalizePath } from 'obsidian';
import { SymlinkManagerSettings, SymlinkManagerSettingTab, DEFAULT_SYMLINK_SETTINGS } from './features/symlink/settings';
import { AssetRouterSettings, FolderRule, TitleOverrideOption } from './features/tree/types';
import { TablitePluginData as SQLSealSettings, DEFAULT_PLUGIN_DATA as DEFAULT_SQLSEAL_SETTINGS } from './features/sqlseal/types';
import { SQLSealSettingsTab } from './features/sqlseal/modules/settings/SQLSealSettingsTab';
import { BasesLeafletViewSettings } from './features/leaflet/types';
import { ConfirmModal, ConflictModal } from './features/tree/ui/modals';
import { FolderSuggest } from './features/tree/ui/folder-suggest';

import { DocmostSettings, DEFAULT_DOCMOST_SETTINGS, DocmostSettingsTab } from './features/docmost/settings';
import { YTCaptureSettings, DEFAULT_YTCAPTURE_SETTINGS } from './features/ytcapture/types';
import { renderYTCaptureSettings } from './features/ytcapture/settings';
import { FolderSyncSettings, DEFAULT_FOLDER_SYNC_SETTINGS } from './features/scriptSync/types';
import { PendingChangesModal } from './features/scriptSync/ui/PendingChangesModal';
import { ScanSyncModal } from './features/scriptSync/ui/ScanSyncModal';
import { VaultFolderSuggest, FolderPickerModal } from './features/scriptSync/ui/FolderPicker';

import type PakCLIPlugin from './main';

import { CodeblockLanguageRule } from './features/codeblock/scaler';

export type TabSortOption = 'a-z' | 'z-a' | 'lightest' | 'heavy' | 'recent' | 'least-recent';

export interface PakCLIPluginSettings extends 
    SymlinkManagerSettings, 
    AssetRouterSettings, 
    SQLSealSettings, 
    BasesLeafletViewSettings,
    DocmostSettings,
    YTCaptureSettings,
    FolderSyncSettings
{
    dateFormat: string;
    codeblockWrapMode: 'flowclip' | 'wrap' | 'scalefit';
    codeblockLanguageRules: CodeblockLanguageRule[];
    pinnedTabs?: string[];
    tabSortOrder?: TabSortOption;
    tabUsageHistory?: Record<string, number>;
    enableAssetDrag: boolean;
}

export const DEFAULT_ASSET_ROUTER_SETTINGS: AssetRouterSettings = {
	centralAssetFolderEnabled: true,
	centralAssetFolder: "assets",
	useNoteTitleGlobalCentral: false,
	useNoteTitleGlobalNested: false,
	rules: [],
	delimiter: "_",
	assetExtensions: ["png", "jpg", "jpeg", "gif", "svg", "pdf", "mp3", "mp4", "wav", "webm", "ogg", "m4a", "xls", "xlsx", "doc", "docx", "zip", "tar", "gz"]
};

// Leaflet defaults are defined in features/leaflet/constants.ts but we can define them here to be safe
export const DEFAULT_LEAFLET_SETTINGS: BasesLeafletViewSettings = {
    enableMeasureTool: true,
    enableCopyTool: true,
    iconData: [],
    defaultOsm: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileTheme: "auto"
};

export const DEFAULT_SETTINGS: PakCLIPluginSettings = {
    ...DEFAULT_SYMLINK_SETTINGS,
    ...DEFAULT_ASSET_ROUTER_SETTINGS,
    ...DEFAULT_SQLSEAL_SETTINGS,
    ...DEFAULT_LEAFLET_SETTINGS,
    ...DEFAULT_DOCMOST_SETTINGS,
    ...DEFAULT_YTCAPTURE_SETTINGS,
    ...DEFAULT_FOLDER_SYNC_SETTINGS,
    dateFormat: '_{yyyy}{mm}{dd}',
    codeblockWrapMode: 'flowclip',
    codeblockLanguageRules: [
        { id: '1', language: 'asci', behavior: 'scalefit' },
        { id: '2', language: 'ascii', behavior: 'scalefit' }
    ],
    pinnedTabs: [],
    tabSortOrder: 'a-z',
    tabUsageHistory: {},
    enableAssetDrag: true,
};

interface SuiteTabInfo {
    id: string;
    label: string;
    weight: number; // 1 (lightest) to 5 (heaviest)
}

const ALL_SUITE_TABS: SuiteTabInfo[] = [
    { id: 'sqlseal',       label: 'SQLSeal & Tablite', weight: 5 },
    { id: 'leaflet',       label: 'Leaflet Map',       weight: 4 },
    { id: 'docmost',       label: 'Docmost Sync',      weight: 3 },
    { id: 'ytcapture',     label: 'YT Extension',      weight: 3 },
    { id: 'foldersync',    label: 'Codeblock Sync',    weight: 3 },
    { id: 'router',        label: 'Asset Router',      weight: 3 },
    { id: 'symlink',       label: 'Symlink Manager',   weight: 2 },
    { id: 'codeblock',     label: 'Codeblock Mode',    weight: 1 },
    { id: 'datepicker',    label: 'Date Picker',       weight: 1 },
    { id: 'assetdraggable', label: 'Asset Draggable',  weight: 1 },
];

export class PakCLISettingTab extends PluginSettingTab {
    private symlinkTab: SymlinkManagerSettingTab;
    private sqlsealTab: SQLSealSettingsTab | null;
    private leafletTab: PluginSettingTab; // BaseLeafletViewSettingsTab
    private activeTab: string;
    private searchQuery: string = '';

    constructor(
        app: App, 
        public override plugin: PakCLIPlugin, 
        symlinkTab: SymlinkManagerSettingTab,
        sqlsealTab: SQLSealSettingsTab | null,
        leafletTab: PluginSettingTab
    ) {
        super(app, plugin);
        this.symlinkTab = symlinkTab;
        this.sqlsealTab = sqlsealTab;
        this.leafletTab = leafletTab;
        this.activeTab = sqlsealTab ? 'sqlseal' : 'ytcapture';
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Suite configuration').setHeading();

        const layoutContainer = containerEl.createDiv({ cls: 'pakcli-settings-layout' });
        const sidebar = layoutContainer.createDiv({ cls: 'pakcli-settings-sidebar' });

        const pinned = this.plugin.settings.pinnedTabs || [];
        const sortOrder = this.plugin.settings.tabSortOrder || 'a-z';
        const usageHistory = this.plugin.settings.tabUsageHistory || {};

        // Available tabs (filter out sqlseal if sqlsealTab is null)
        const availableTabs = ALL_SUITE_TABS.filter(t => t.id !== 'sqlseal' || this.sqlsealTab !== null);

        // Filter by Search Query
        const query = this.searchQuery.trim().toLowerCase();
        const filteredTabs = availableTabs.filter(t => t.label.toLowerCase().includes(query));

        // Sort tabs helper
        const sortTabs = (tabs: SuiteTabInfo[]): SuiteTabInfo[] => {
            const copy = [...tabs];
            switch (sortOrder) {
                case 'a-z':
                    return copy.sort((a, b) => a.label.localeCompare(b.label));
                case 'z-a':
                    return copy.sort((a, b) => b.label.localeCompare(a.label));
                case 'lightest':
                    return copy.sort((a, b) => a.weight - b.weight);
                case 'heavy':
                    return copy.sort((a, b) => b.weight - a.weight);
                case 'recent':
                    return copy.sort((a, b) => (usageHistory[b.id] || 0) - (usageHistory[a.id] || 0));
                case 'least-recent':
                    return copy.sort((a, b) => (usageHistory[a.id] || 0) - (usageHistory[b.id] || 0));
                default:
                    return copy;
            }
        };

        // ── Controls Box (Search + Sort) ──────────────────────────────────────
        const controlsContainer = sidebar.createDiv({ cls: 'pakcli-sidebar-controls' });

        // Search Box
        const searchInput = controlsContainer.createEl('input', {
            cls: 'pakcli-sidebar-search',
            type: 'text',
            placeholder: '🔍 Search settings…',
            value: this.searchQuery,
        }) as HTMLInputElement;

        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            this.display();
            // Restore focus after re-rendering display
            const reSearch = sidebar.querySelector('.pakcli-sidebar-search') as HTMLInputElement | null;
            if (reSearch) {
                reSearch.focus();
                reSearch.setSelectionRange(reSearch.value.length, reSearch.value.length);
            }
        });

        // Sort Dropdown
        const sortSelect = controlsContainer.createEl('select', {
            cls: 'pakcli-sidebar-sort',
        }) as HTMLSelectElement;

        const options: { val: TabSortOption; label: string }[] = [
            { val: 'a-z',          label: 'Sort: A-Z' },
            { val: 'z-a',          label: 'Sort: Z-A' },
            { val: 'lightest',     label: 'Sort: Lightest → Heavy' },
            { val: 'heavy',        label: 'Sort: Heavy → Lightest' },
            { val: 'recent',       label: 'Sort: Recent Used' },
            { val: 'least-recent', label: 'Sort: Most Not Used' },
        ];

        options.forEach(opt => {
            const el = sortSelect.createEl('option', { value: opt.val, text: opt.label });
            if (opt.val === sortOrder) el.selected = true;
        });

        sortSelect.addEventListener('change', async () => {
            this.plugin.settings.tabSortOrder = sortSelect.value as TabSortOption;
            await this.plugin.saveSettings();
            this.display();
        });

        // ── Tab Item Renderer Helper ──────────────────────────────────────────
        const renderTabItem = (parent: HTMLElement, tab: SuiteTabInfo, isPinned: boolean) => {
            const row = parent.createDiv({
                cls: `pakcli-tab-item ${this.activeTab === tab.id ? 'active' : ''} ${isPinned ? 'pinned' : ''}`,
            });

            const btn = row.createEl('button', {
                cls: `pakcli-tab-btn ${this.activeTab === tab.id ? 'active' : ''}`,
                text: tab.label,
            });

            btn.addEventListener('click', async () => {
                this.activeTab = tab.id;
                if (!this.plugin.settings.tabUsageHistory) {
                    this.plugin.settings.tabUsageHistory = {};
                }
                this.plugin.settings.tabUsageHistory[tab.id] = Date.now();
                await this.plugin.saveSettings();
                this.display();
            });

            const pinBtn = row.createEl('button', {
                cls: `pakcli-pin-btn ${isPinned ? 'is-pinned' : ''}`,
                text: isPinned ? '📌' : '📍',
                attr: { title: isPinned ? 'Unpin tab' : 'Pin tab (max 3)' },
            });

            pinBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                let curPinned = [...(this.plugin.settings.pinnedTabs || [])];
                if (isPinned) {
                    curPinned = curPinned.filter(id => id !== tab.id);
                } else {
                    if (curPinned.length >= 3) {
                        new Notice('Maximum 3 pinned tabs allowed.');
                        return;
                    }
                    curPinned.push(tab.id);
                }
                this.plugin.settings.pinnedTabs = curPinned;
                await this.plugin.saveSettings();
                this.display();
            });
        };

        const tabsContainer = sidebar.createDiv({ cls: 'pakcli-tabs-list' });

        // Separate pinned vs unpinned from filtered tabs
        const pinnedList = pinned
            .map(id => availableTabs.find(t => t.id === id))
            .filter((t): t is SuiteTabInfo => t !== undefined && t.label.toLowerCase().includes(query));

        const unpinnedList = sortTabs(
            filteredTabs.filter(t => !pinned.includes(t.id))
        );

        // Render Pinned Section if any
        if (pinnedList.length > 0) {
            tabsContainer.createDiv({ cls: 'pakcli-sidebar-section-title', text: `📌 PINNED (${pinnedList.length}/3)` });
            pinnedList.forEach(tab => renderTabItem(tabsContainer, tab, true));
        }

        // Render All / Unpinned Section
        if (unpinnedList.length > 0) {
            if (pinnedList.length > 0) {
                tabsContainer.createDiv({ cls: 'pakcli-sidebar-section-title', text: 'ALL MODULES' });
            }
            unpinnedList.forEach(tab => renderTabItem(tabsContainer, tab, false));
        }

        if (pinnedList.length === 0 && unpinnedList.length === 0) {
            tabsContainer.createDiv({ cls: 'pakcli-sidebar-empty', text: 'No matching settings found.' });
        }

        const contentContainer = layoutContainer.createDiv({ cls: 'pakcli-tab-content' });

        if (this.activeTab === 'ytcapture') {
            renderYTCaptureSettings(this.app, this.plugin, contentContainer);
        } else if (this.activeTab === 'docmost') {
            const docmostTab = new DocmostSettingsTab(this.app, this.plugin);
            docmostTab.containerEl = contentContainer;
            docmostTab.display();
        } else if (this.activeTab === 'symlink') {
            this.symlinkTab.display(contentContainer);
        } else if (this.activeTab === 'sqlseal' && this.sqlsealTab) {
            (this.sqlsealTab as unknown as { display(el?: HTMLElement): void }).display(contentContainer);
        } else if (this.activeTab === 'leaflet') {
            (this.leafletTab as unknown as { display(el?: HTMLElement): void }).display(contentContainer);
        } else if (this.activeTab === 'codeblock') {
            const pluginSettings = this.plugin.settings;
            if (!pluginSettings.codeblockLanguageRules) {
                pluginSettings.codeblockLanguageRules = [
                    { id: '1', language: 'asci', behavior: 'scalefit' },
                    { id: '2', language: 'ascii', behavior: 'scalefit' }
                ];
            }

            const saveSettings = async () => {
                await this.plugin.saveSettings();
                this.plugin.applyCodeblockStyle();
            };

            new Setting(contentContainer).setName('Codeblock Display & Language Rules').setHeading();

            new Setting(contentContainer)
                .setName('Default Fallback Mode')
                .setDesc('Fallback mode for codeblocks that do not match any custom language rule below.')
                .addDropdown((dropdown) =>
                    dropdown
                        .addOption('flowclip', 'Flow Clip (Horizontal Scroll / No Wrap)')
                        .addOption('wrap', 'Wrap Text (Multi-line)')
                        .addOption('scalefit', 'Scale to Fit (Auto-scale font to fit page width)')
                        .setValue(pluginSettings.codeblockWrapMode || 'flowclip')
                        .onChange(async (value: 'flowclip' | 'wrap' | 'scalefit') => {
                            pluginSettings.codeblockWrapMode = value;
                            await saveSettings();
                        })
                );

            new Setting(contentContainer).setName('Language Format Mappings').setHeading();
            contentContainer.createEl('p', {
                text: 'Map specific codeblock format tags (e.g. asci, ascii, python, text) to custom behaviors.',
                cls: 'setting-item-description'
            });

            const rulesContainer = contentContainer.createDiv({ cls: 'codeblock-rules-container' });

            const renderRules = () => {
                rulesContainer.empty();
                pluginSettings.codeblockLanguageRules.forEach((rule, index) => {
                    const setting = new Setting(rulesContainer);

                    setting
                        .addText((text) =>
                            text
                                .setPlaceholder('Language (e.g. asci)')
                                .setValue(rule.language)
                                .onChange(async (val) => {
                                    rule.language = val.trim();
                                    await saveSettings();
                                })
                        )
                        .addDropdown((dropdown) =>
                            dropdown
                                .addOption('scalefit', 'Scale to Fit (1:1 Aspect Ratio)')
                                .addOption('flowclip', 'Flow Clip (Horizontal Scroll)')
                                .addOption('wrap', 'Wrap Text (Multi-line)')
                                .setValue(rule.behavior)
                                .onChange(async (val: 'scalefit' | 'flowclip' | 'wrap') => {
                                    rule.behavior = val;
                                    await saveSettings();
                                })
                        )
                        .addButton((btn) =>
                            btn
                                .setIcon('trash')
                                .setTooltip('Delete rule')
                                .onClick(async () => {
                                    pluginSettings.codeblockLanguageRules.splice(index, 1);
                                    await saveSettings();
                                    renderRules();
                                })
                        );
                });
            };

            renderRules();

            new Setting(contentContainer)
                .addButton((btn) =>
                    btn
                        .setButtonText('+ Add Language Rule')
                        .setCta()
                        .onClick(async () => {
                            pluginSettings.codeblockLanguageRules.push({
                                id: Date.now().toString(),
                                language: '',
                                behavior: 'scalefit'
                            });
                            await saveSettings();
                            renderRules();
                        })
                );
        } else if (this.activeTab === 'datepicker') {
            const pluginSettings = this.plugin.settings;
            const saveSettings = async () => await this.plugin.saveData(pluginSettings);

            new Setting(contentContainer)
                .setName('Date format')
                .setDesc('Format template for Ctrl + D date picker. Placeholders: {yyyy}, {yy}, {mm}, {m}, {dd}, {d}')
                .addText((t) =>
                    t
                        .setPlaceholder('_{yyyy}{mm}{dd}')
                        .setValue(pluginSettings.dateFormat)
                        .onChange(async (v) => {
                            pluginSettings.dateFormat = v || '_{yyyy}{mm}{dd}';
                            await saveSettings();
                        })
                );
        } else if (this.activeTab === 'assetdraggable') {
            const pluginSettings = this.plugin.settings;
            const saveSettings = async () => await this.plugin.saveSettings();

            new Setting(contentContainer).setName('Asset Draggable').setHeading();
            contentContainer.createEl('p', {
                text: 'Drag images, PDFs, videos, and other attachments from your notes directly into external apps — Gmail, Slack, Google Drive, desktop — without leaving Obsidian.',
                cls: 'setting-item-description',
            });

            new Setting(contentContainer)
                .setName('Enable native attachment drag')
                .setDesc('Make attachments embedded in notes draggable as real OS-level files. Reload Obsidian after toggling for the change to take effect.')
                .addToggle((toggle) =>
                    toggle
                        .setValue(pluginSettings.enableAssetDrag ?? true)
                        .onChange(async (value) => {
                            pluginSettings.enableAssetDrag = value;
                            await saveSettings();
                        })
                );
        } else if (this.activeTab === 'foldersync') {
            const pluginSettings = this.plugin.settings;
            const saveSettings = async () => await this.plugin.saveSettings();

            new Setting(contentContainer).setName('Codeblock Sync (Two-Way Script Sync)').setHeading();
            contentContainer.createEl('p', {
                text: 'Synchronizes scripts between your note codeblocks (.md first codeblock) and standalone script files (.ps1, .py, .js, .sh) inside your self-vault or in an external folder.',
                cls: 'setting-item-description'
            });

            new Setting(contentContainer)
                .setName('Enable Codeblock Sync')
                .setDesc('Enable change detection, visual diffs, and execution controls for script codeblocks.')
                .addToggle((toggle) =>
                    toggle
                        .setValue(pluginSettings.enabled ?? true)
                        .onChange(async (value) => {
                            pluginSettings.enabled = value;
                            await saveSettings();
                        })
                );

            new Setting(contentContainer)
                .setName('Script Target Folder (Vault-Relative)')
                .setDesc('Target folder inside your vault where script files live (e.g. "ALL SCRIPT", "scripts", "ALL POWERSHELL").')
                .addText((text) => {
                    text
                        .setPlaceholder('e.g. ALL SCRIPT')
                        .setValue(pluginSettings.cliRootFolder || '')
                        .onChange(async (value) => {
                            pluginSettings.cliRootFolder = value;
                            await saveSettings();
                            this.plugin.syncManager?.init();
                        });
                    new VaultFolderSuggest(this.app, text.inputEl);
                })
                .addButton((btn) => {
                    btn
                        .setButtonText('📁 Browse...')
                        .setTooltip('Pick a folder from your vault')
                        .onClick(() => {
                            new FolderPickerModal(this.app, async (selected) => {
                                pluginSettings.cliRootFolder = selected;
                                await saveSettings();
                                this.plugin.syncManager?.init();
                                this.display();
                            }).open();
                        });
                });

            new Setting(contentContainer)
                .setName('Notes Source Folder (Vault-Relative)')
                .setDesc('Folder in your vault where your script notes live (e.g. "Digital Library/CLI & Commands", "ALL DRAFT", or leave blank for whole vault).')
                .addText((text) => {
                    text
                        .setPlaceholder('e.g. Digital Library/CLI & Commands (or leave empty)')
                        .setValue(pluginSettings.managerRootFolder || '')
                        .onChange(async (value) => {
                            pluginSettings.managerRootFolder = value;
                            await saveSettings();
                            this.plugin.syncManager?.init();
                        });
                    new VaultFolderSuggest(this.app, text.inputEl);
                })
                .addButton((btn) => {
                    btn
                        .setButtonText('📁 Browse...')
                        .setTooltip('Pick a folder from your vault')
                        .onClick(() => {
                            new FolderPickerModal(this.app, async (selected) => {
                                pluginSettings.managerRootFolder = selected;
                                await saveSettings();
                                this.plugin.syncManager?.init();
                                this.display();
                            }).open();
                        });
                });

            new Setting(contentContainer)
                .setName('Auto-Watch Script Directory')
                .setDesc('Automatically monitor the target script folder for external file edits and additions.')
                .addToggle((toggle) =>
                    toggle
                        .setValue(pluginSettings.autoWatchCliFolder ?? true)
                        .onChange(async (value) => {
                            pluginSettings.autoWatchCliFolder = value;
                            await saveSettings();
                        })
                );

            new Setting(contentContainer)
                .setName('Scan & Sync Dashboard')
                .setDesc('Scan all notes in your notes source folder, compare them against target scripts, and bulk sync with 1 click.')
                .addButton((btn) =>
                    btn
                        .setButtonText('🔍 Open Scan Dashboard')
                        .setCta()
                        .onClick(() => {
                            new ScanSyncModal(
                                this.app,
                                this.plugin.syncManager,
                                () => this.plugin.settings,
                                () => this.plugin.saveSettings()
                            ).open();
                        })
                );

            const pendingCount = (pluginSettings.pendingChanges || []).length;
            new Setting(contentContainer)
                .setName('Pending Sync Queue')
                .setDesc(`Review deferred ("Remind me later") changes. Currently ${pendingCount} pending items.`)
                .addButton((btn) =>
                    btn
                        .setButtonText(`Review Queue (${pendingCount})`)
                        .onClick(() => {
                            new PendingChangesModal(
                                this.app,
                                this.plugin.syncManager,
                                () => this.plugin.settings,
                                () => this.plugin.saveSettings()
                            ).open();
                        })
                );
        } else if (this.activeTab === 'router') {
            const pluginSettings = this.plugin.settings;
            const saveSettings = async () => await this.plugin.saveSettings();

            new Setting(contentContainer).setName('Centralized Mode (Default)').setHeading();

            new Setting(contentContainer)
                .setName('Enable Centralized Routing')
                .setDesc('Route all attachments to a single global directory by default.')
                .addToggle(toggle => toggle
                    .setValue(pluginSettings.centralAssetFolderEnabled)
                    .onChange(async (value) => {
                        pluginSettings.centralAssetFolderEnabled = value;
                        await saveSettings();
                        this.display(); // Refresh to toggle visibility of dependent settings
                    }));

            if (pluginSettings.centralAssetFolderEnabled) {
                new Setting(contentContainer)
                    .setName('Central Asset Folder')
                    .setDesc('Directory at the vault root where default assets will be saved.')
                    .addText(text => {
                        text.setPlaceholder('assets')
                            .setValue(pluginSettings.centralAssetFolder)
                            .onChange(async (value) => {
                                pluginSettings.centralAssetFolder = value.trim() || 'assets';
                                await saveSettings();
                            });
                        new FolderSuggest(this.app, text.inputEl);
                    });

                new Setting(contentContainer)
                    .setName('Use Note Title in Centralized Mode')
                    .setDesc('Use note frontmatter "title" property when renaming attachments instead of filename.')
                    .addToggle(toggle => toggle
                        .setValue(pluginSettings.useNoteTitleGlobalCentral)
                        .onChange(async (value) => {
                            pluginSettings.useNoteTitleGlobalCentral = value;
                            await saveSettings();
                        }));

                new Setting(contentContainer)
                    .setName('Rescan Centralized Assets')
                    .setDesc('Scan the vault and organize all attachments for notes in Centralized Mode (excluding Captain Folders).')
                    .addButton(button => button
                        .setButtonText('Rescan Centralized')
                        .onClick(async () => {
                            button.setDisabled(true);
                            await this.plugin.router.rescanCentralizedAssets();
                            button.setDisabled(false);
                        }));
            }

            // ==========================================
            // 2. Global Nested Mode Settings
            // ==========================================
            new Setting(contentContainer).setName('Nested Mode Globals').setHeading();

            new Setting(contentContainer)
                .setName('Use Note Title in Nested Mode (Default)')
                .setDesc('Default setting for Captain Folders to use frontmatter "title" property.')
                .addToggle(toggle => toggle
                    .setValue(pluginSettings.useNoteTitleGlobalNested)
                    .onChange(async (value) => {
                        pluginSettings.useNoteTitleGlobalNested = value;
                        await saveSettings();
                    }));

            new Setting(contentContainer)
                .setName('Path Delimiter')
                .setDesc('Character used to join directories and file titles.')
                .addDropdown(dropdown => dropdown
                    .addOption('-', '-')
                    .addOption('_', '_')
                    .setValue(pluginSettings.delimiter)
                    .onChange(async (value) => {
                        pluginSettings.delimiter = value;
                        await saveSettings();
                    }));

            new Setting(contentContainer)
                .setName('Monitored File Extensions')
                .setDesc('Comma-separated list of file extensions that the plugin should route.')
                .addTextArea(text => text
                    .setPlaceholder('png, jpg, jpeg, pdf')
                    .setValue(pluginSettings.assetExtensions.join(', '))
                    .onChange(async (value) => {
                        pluginSettings.assetExtensions = value
                            .split(',')
                            .map(ext => ext.trim().toLowerCase())
                            .filter(ext => ext !== '');
                        await saveSettings();
                    }));

            // ==========================================
            // 3. Captain Folders (Rules) Settings
            // ==========================================
            new Setting(contentContainer).setName('Nested Mode Override Rules (Captain Folders)').setHeading();

            // Bulk operations
            const bulkContainer = contentContainer.createDiv({ cls: 'asset-router-bulk-container' });
            bulkContainer.setCssStyles({ marginBottom: '10px' });

            new ButtonComponent(bulkContainer)
                .setButtonText('Turn On All Rules')
                .setCta()
                .onClick(() => {
                    new ConfirmModal(
                        this.app,
                        'Are you sure you want to enable ALL Captain Folder rules?',
                        async () => {
                            pluginSettings.rules.forEach(r => r.enabled = true);
                            await saveSettings();
                            this.display();
                            new Notice('All rules enabled');
                        }
                    ).open();
                });

            const turnOffBtn = new ButtonComponent(bulkContainer)
                .setButtonText('Turn Off All Rules')
                .onClick(() => {
                    new ConfirmModal(
                        this.app,
                        'Are you sure you want to disable ALL Captain Folder rules?',
                        async () => {
                            pluginSettings.rules.forEach(r => r.enabled = false);
                            await saveSettings();
                            this.display();
							new Notice('All rules disabled');
                        }
                    ).open();
                });
            turnOffBtn.buttonEl.setCssStyles({ marginLeft: '10px' });

            const rescanAllBtn = new ButtonComponent(bulkContainer)
                .setButtonText('Rescan All Nested')
                .onClick(async () => {
                    rescanAllBtn.setDisabled(true);
                    await this.plugin.router.rescanAllNestedAssets();
                    rescanAllBtn.setDisabled(false);
                });
            rescanAllBtn.buttonEl.setCssStyles({ marginLeft: '10px' });

            // Form to add a new rule
            new Setting(contentContainer).setName('Add New Captain Folder Rule').setHeading();
            const addRuleDiv = contentContainer.createDiv();
            addRuleDiv.setCssStyles({
                border: '1px solid var(--background-modifier-border)',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px'
            });

            let newPath = '';
            let newScope = 'children'; // 'folder' | 'children'
            let newSubCaptain = false;
            let newTitleOverride: TitleOverrideOption = 'inherit';

            new Setting(addRuleDiv)
                .setName('Folder Path')
                .setDesc('Relative path from vault root (e.g. folderb or folderb/*)')
                .addText(text => {
                    text.setPlaceholder('e.g. folderb/projects')
                        .onChange(value => newPath = value.trim());
                    new FolderSuggest(this.app, text.inputEl);
                });

            new Setting(addRuleDiv)
                .setName('Rule Scope')
                .setDesc('Should this rule apply to subfolders too?')
                .addDropdown(dropdown => dropdown
                    .addOption('folder', 'Folder Only (Exclude Children)')
                    .addOption('children', 'Include Children')
                    .setValue(newScope)
                    .onChange(value => newScope = value));

            new Setting(addRuleDiv)
                .setName('Auto Sub-Captain Mode')
                .setDesc('Treat each subfolder under this Captain Folder as an independent Sub-Captain with its own assets/ directory.')
                .addToggle(toggle => toggle
                    .setValue(newSubCaptain)
                    .onChange(value => newSubCaptain = value));

            new Setting(addRuleDiv)
                .setName('Note Title Override')
                .setDesc('How to handle Note Title frontmatter parsing for this folder.')
                .addDropdown(dropdown => dropdown
                    .addOption('inherit', 'Inherit Default')
                    .addOption('always', 'Always Use Title')
                    .addOption('never', 'Never Use Title')
                    .setValue(newTitleOverride)
                    .onChange((value: string) => newTitleOverride = value as TitleOverrideOption));

            const addBtnContainer = addRuleDiv.createDiv();
            addBtnContainer.setCssStyles({
                textAlign: 'right',
                marginTop: '10px'
            });

            new ButtonComponent(addBtnContainer)
                .setButtonText('Add Rule')
                .setCta()
                .onClick(async () => {
                    if (!newPath) {
                        new Notice('Please specify a folder path.');
                        return;
                    }

                    const normalizedPath = normalizePath(newPath);
                    
                    // Check duplicate rule
                    const existingIndex = pluginSettings.rules.findIndex(r => normalizePath(r.path) === normalizedPath);
                    const isNestedScope = newScope === 'children';

                    const newRule: FolderRule = {
                        path: normalizedPath,
                        isNested: true,
                        includeChildren: isNestedScope,
                        subCaptainMode: newSubCaptain,
                        useNoteTitle: newTitleOverride,
                        enabled: true
                    };

                    if (isNestedScope) {
                        // Check conflicts: subfolders that already have specific rules
                        const conflicts = pluginSettings.rules.filter(r => {
                            const childPath = normalizePath(r.path);
                            return childPath !== normalizedPath && childPath.startsWith(normalizedPath + '/');
                        });

                        if (conflicts.length > 0) {
                            // Open Overwrite confirmation modal
                            new ConflictModal(
                                this.app,
                                conflicts,
                                async (overwrite: boolean) => {
                                    if (overwrite) {
                                        // Delete child rules
                                        pluginSettings.rules = pluginSettings.rules.filter(r => {
                                            const childPath = normalizePath(r.path);
                                            return !(childPath !== normalizedPath && childPath.startsWith(normalizedPath + '/'));
                                        });
                                    }
                                    await this.addOrUpdateRule(newRule, existingIndex);
                                }
                            ).open();
							return;
                        }
                    }

                    await this.addOrUpdateRule(newRule, existingIndex);
                });

            // Rules List / Table
            new Setting(contentContainer).setName('Active Rules').setHeading();
            if (pluginSettings.rules.length === 0) {
                contentContainer.createEl('p', { text: 'No active Captain Folder rules defined.', cls: 'empty-rules' });
                return;
            }

            const rulesTable = contentContainer.createDiv({ cls: 'asset-router-rules-table' });
            rulesTable.setCssStyles({ width: '100%' });

            pluginSettings.rules.forEach((rule, idx) => {
                const row = rulesTable.createDiv();
                row.setCssStyles({
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px',
                    borderBottom: '1px solid var(--background-modifier-border)',
                    ...(rule.enabled ? {} : { opacity: '0.5' })
                });

                // Details
                const details = row.createDiv();
                details.setCssStyles({ flex: '1' });
                const pathEl = details.createEl('strong', { text: rule.path === "" ? "/" : rule.path });
                pathEl.setCssStyles({ fontSize: '1.1em' });
                
                const subCaptainBadge = rule.subCaptainMode ? ' | Sub-Captain: Enabled' : '';
                const metaText = `Scope: ${rule.includeChildren ? 'Include Children' : 'Folder Only'}${subCaptainBadge} | Title: ${rule.useNoteTitle}`;
                details.createEl('div', { text: metaText, cls: 'setting-item-description' });

                // Controls
                const controls = row.createDiv();
                controls.setCssStyles({
                    display: 'flex',
                    alignItems: 'center'
                });

                // Individual Rule Switch
                const switchContainer = controls.createDiv();
                switchContainer.setCssStyles({ marginRight: '15px' });
                
                const toggle = switchContainer.createEl('input', { type: 'checkbox' });
                toggle.checked = rule.enabled;
                toggle.addEventListener('change', async () => {
                    rule.enabled = toggle.checked;
                    await saveSettings();
                    this.display(); // Refresh view
                });

                // Rescan button
                const rescanBtn = new ButtonComponent(controls)
                    .setButtonText('Rescan')
                    .onClick(async () => {
                        rescanBtn.setDisabled(true);
                        await this.plugin.router.rescanFolderRuleAssets(rule);
                        rescanBtn.setDisabled(false);
                    });
                rescanBtn.buttonEl.setCssStyles({ marginRight: '10px' });

                // Delete button
                new ButtonComponent(controls)
                    .setButtonText('Remove')
                    .setWarning()
                    .onClick(async () => {
                        pluginSettings.rules.splice(idx, 1);
                        await saveSettings();
                        this.display();
                        new Notice('Rule removed.');
                    });
            });
        }
    }

    private async addOrUpdateRule(rule: FolderRule, existingIndex: number) {
        const pluginSettings = this.plugin.settings;
        if (existingIndex !== -1) {
            pluginSettings.rules.splice(existingIndex, 1, rule);
            new Notice('Updated rule for ' + rule.path);
        } else {
            pluginSettings.rules.push(rule);
            new Notice('Added rule for ' + rule.path);
        }
        await this.plugin.saveSettings();
        this.display();
    }
}
