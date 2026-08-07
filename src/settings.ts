import { App, PluginSettingTab, Plugin, Setting, ButtonComponent, Notice, normalizePath } from 'obsidian';
import { SymlinkManagerSettings, SymlinkManagerSettingTab, DEFAULT_SYMLINK_SETTINGS } from './features/symlink/settings';
import { AssetRouterSettings, FolderRule, TitleOverrideOption } from './features/tree/types';
import { TablitePluginData as SQLSealSettings, DEFAULT_PLUGIN_DATA as DEFAULT_SQLSEAL_SETTINGS } from './features/sqlseal/types';
import { SQLSealSettingsTab } from './features/sqlseal/modules/settings/SQLSealSettingsTab';
import { BasesLeafletViewSettings } from './features/leaflet/types';
import { ConfirmModal, ConflictModal } from './features/tree/ui/modals';
import { FolderSuggest } from './features/tree/ui/folder-suggest';

import { DocmostSettings, DEFAULT_DOCMOST_SETTINGS, DocmostSettingsTab } from './features/docmost/settings';

export interface PakCLIPluginSettings extends 
    SymlinkManagerSettings, 
    AssetRouterSettings, 
    SQLSealSettings, 
    BasesLeafletViewSettings,
    DocmostSettings 
{
    dateFormat: string;
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
    dateFormat: '_{yyyy}{mm}{dd}'
};

export class PakCLISettingTab extends PluginSettingTab {
    private symlinkTab: SymlinkManagerSettingTab;
    private sqlsealTab: SQLSealSettingsTab | null;
    private leafletTab: PluginSettingTab; // BaseLeafletViewSettingsTab
    private activeTab: string;

    constructor(
        app: App, 
        plugin: Plugin, 
        symlinkTab: SymlinkManagerSettingTab,
        sqlsealTab: SQLSealSettingsTab | null,
        leafletTab: PluginSettingTab
    ) {
        super(app, plugin);
        this.symlinkTab = symlinkTab;
        this.sqlsealTab = sqlsealTab;
        this.leafletTab = leafletTab;
        this.activeTab = sqlsealTab ? 'sqlseal' : 'leaflet';
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        const layoutContainer = containerEl.createDiv({ cls: 'pakcli-settings-layout' });

        const sidebarContainer = layoutContainer.createDiv({ cls: 'pakcli-settings-sidebar' });
        new Setting(sidebarContainer).setName("PakCLI Editor's Choice").setHeading();

        const tabsContainer = sidebarContainer.createDiv({ cls: 'pakcli-tabs-header' });

        const createTabBtn = (id: string, label: string) => {
            const btn = tabsContainer.createEl('button', { text: label });
            if (this.activeTab === id) {
                btn.className = 'active-tab';
            }
            
            btn.onclick = () => {
                this.activeTab = id;
                this.display();
            };
        };

        if (this.sqlsealTab) {
            createTabBtn('sqlseal', 'SQLSeal & Data');
        }
        createTabBtn('docmost', 'Docmost Sync');
        createTabBtn('leaflet', 'Leaflet Maps');
        createTabBtn('symlink', 'Symlinks');
        createTabBtn('router', 'Asset Router');
        createTabBtn('datepicker', 'Date Picker');

        const contentContainer = layoutContainer.createDiv({ cls: 'pakcli-tab-content' });

        if (this.activeTab === 'docmost') {
            const docmostTab = new DocmostSettingsTab(this.app, this.plugin);
            docmostTab.containerEl = contentContainer;
            docmostTab.display();
        } else if (this.activeTab === 'symlink') {
            (this.symlinkTab as any).display(contentContainer);
        } else if (this.activeTab === 'sqlseal' && this.sqlsealTab) {
            (this.sqlsealTab as any).display(contentContainer);
        } else if (this.activeTab === 'leaflet') {
            (this.leafletTab as any).display(contentContainer);
        } else if (this.activeTab === 'datepicker') {
            const pluginSettings = (this.plugin as any).settings as PakCLIPluginSettings;
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
        } else if (this.activeTab === 'router') {
            const pluginSettings = (this.plugin as any).settings as PakCLIPluginSettings;
            const saveSettings = async () => await (this.plugin as any).saveSettings();

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
                            await (this.plugin as any).router.rescanCentralizedAssets();
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
                    await (this.plugin as any).router.rescanAllNestedAssets();
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
            addBtnContainer.style.textAlign = 'right';
            addBtnContainer.style.marginTop = '10px';

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
                        await (this.plugin as any).router.rescanFolderRuleAssets(rule);
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
        const pluginSettings = (this.plugin as any).settings as PakCLIPluginSettings;
        if (existingIndex !== -1) {
            pluginSettings.rules.splice(existingIndex, 1, rule);
            new Notice('Updated rule for ' + rule.path);
        } else {
            pluginSettings.rules.push(rule);
            new Notice('Added rule for ' + rule.path);
        }
        await (this.plugin as any).saveSettings();
        this.display();
    }
}
