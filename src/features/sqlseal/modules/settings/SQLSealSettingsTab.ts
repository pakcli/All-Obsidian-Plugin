import { App, PluginSettingTab, Setting, Plugin, Notice } from 'obsidian';
import { Settings } from './Settings';
import { SettingsControls } from './settingsTabSection/SettingsControls';
import { parseAutocompleteSettings, formatHeaderName } from '../../utils/views';
import { GenericTextSuggest } from '../../utils/suggesters';

export interface SQLSealSettings {
    enableViewer: boolean;
    enableEditing: boolean;
    enableJSONViewer: boolean;
    enableJSONLViewer: boolean;
    enableSQLViewer: boolean;
    enableDynamicUpdates: boolean;
    enableSyntaxHighlighting: boolean;
    disableTagAutoDetection: boolean;
    defaultView: 'grid' | 'markdown' | 'html';
    gridItemsPerPage: number;
    autocompleteColumns: string;
    codeblockViews?: Record<string, Record<string, string>>;
    scannerMerchantPath?: string;
    scannerMerchantCol?: string;
    scannerCategoryPath?: string;
    scannerCategoryCol?: string;
    scannerClearAfterSave?: boolean;
    scannerFinanceFolderPath?: string;
}

export const DEFAULT_SETTINGS: SQLSealSettings = {
    enableViewer: false,
    enableEditing: true,
    enableJSONViewer: true,
    enableJSONLViewer: true,
    enableSQLViewer: true,
    enableDynamicUpdates: true,
    enableSyntaxHighlighting: true,
    disableTagAutoDetection: false,
    defaultView: 'grid',
    gridItemsPerPage: 20,
    autocompleteColumns: 'item_name, merchant',
    codeblockViews: {}
};


export class SQLSealSettingsTab extends PluginSettingTab {
    plugin: Plugin;
    // settings: SQLSealSettings;
    private onChangeFns: Array<(setting: SQLSealSettings) => void> = []

    constructor(app: App, plugin: Plugin, private settings: Settings) {
        super(app, plugin);
        this.plugin = plugin;
        this.settings = settings;
    }

    private controls: SettingsControls[] = []

    registerControls(...controls: SettingsControls[]) {
        this.controls = controls
    }

    display(containerEl: HTMLElement = this.containerEl): void {
        containerEl.empty();

        this.controls.forEach(c => {
            c.display(containerEl.createDiv())
        })


        new Setting(containerEl).setName('Behavior').setHeading();
        new Setting(containerEl)
            .setName('Enable Dynamic Updates')
            .setDesc('SQLSeal will refresh your tables when underlying data changes.')
            .addToggle(toggle => toggle
                .setValue(this.settings.get('enableDynamicUpdates'))
                .onChange(async (value) => {
                    this.settings.set('enableDynamicUpdates', !!value)
                    // await this.plugin.saveData(this.settings);
                    this.display();
                    // this.callChanges()
                }));
        new Setting(containerEl)
            .setName('Enable Syntax Highlighting')
            .setDesc('Syntax will get highlighted when editing SQLSeal code')
            .addToggle(toggle => toggle
                .setValue(this.settings.get('enableSyntaxHighlighting'))
                .onChange(async (value) => {
                    this.settings.set('enableSyntaxHighlighting', !!value)
                    // await this.plugin.saveData(this.settings);
                    this.display();
                    // this.callChanges()
                }));
        new Setting(containerEl)
            .setName('Debug mode')
            .setDesc('Enable console logging and screen notifications (Notices) during file operations to help troubleshoot saving issues.')
            .addToggle(toggle => toggle
                .setValue(this.settings.get('debug' as any))
                .onChange(async (value) => {
                    this.settings.set('debug' as any, !!value)
                    this.display();
                }));
        new Setting(containerEl)
            .setName('Disable Tag Auto-Detection')
            .setDesc('By default SQLSeal automatically rewrites `tag = \'#a\' AND tag = \'#b\'` into an efficient INTERSECT query. Enable this to turn off that behaviour and write raw SQL yourself.')
            .addToggle(toggle => toggle
                .setValue(this.settings.get('disableTagAutoDetection'))
                .onChange(async (value) => {
                    this.settings.set('disableTagAutoDetection', !!value)
                    this.display();
                }));
		new Setting(containerEl).setName('Autocomplete & Wikilink Columns').setHeading();
		containerEl.createEl('p', { 
			text: 'Configure columns that will have autocomplete suggestions (based on values in the column) and behave as Ctrl+Click wikilinks without requiring brackets [[ ]].',
			cls: 'setting-item-description'
		});

		const listContainer = containerEl.createDiv({ cls: 'sqlseal-settings-columns-list' });

		const renderColumnList = () => {
			listContainer.empty();
			const settingStr = this.settings.get('autocompleteColumns' as any) || '';
			const { configs } = parseAutocompleteSettings(settingStr);

			configs.forEach((cfg, index) => {
				const row = listContainer.createDiv({ cls: 'sqlseal-settings-column-row' });
				row.setCssStyles({
					display: 'flex',
					alignItems: 'center',
					gap: '10px',
					marginBottom: '8px'
				});

				// Column Name input
				const colInput = row.createEl('input', { 
					type: 'text', 
					value: cfg.column, 
					placeholder: 'Column name...' 
				});
				colInput.setCssStyles({ flex: '1' });
				colInput.addEventListener('change', () => {
					cfg.column = colInput.value.trim();
					if (cfg.replacementEnabled && !cfg.replacement.trim()) {
						repInput.value = formatHeaderName(cfg.column);
						cfg.replacement = repInput.value;
					}
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs.filter(c => c.column.trim())));
				});

				// Text Replacement Toggle
				const repLabel = row.createEl('label');
				repLabel.setCssStyles({
					display: 'flex',
					alignItems: 'center',
					gap: '4px'
				});
				
				const repCheckbox = repLabel.createEl('input', {
					type: 'checkbox'
				});
				repCheckbox.checked = cfg.replacementEnabled;
				repLabel.createSpan({ text: 'Replace' });
				
				repCheckbox.addEventListener('change', () => {
					cfg.replacementEnabled = repCheckbox.checked;
					repInput.disabled = !cfg.replacementEnabled;
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs.filter(c => c.column.trim())));
				});

				// Replacement Input
				const repInput = row.createEl('input', { 
					type: 'text', 
					value: cfg.replacement || formatHeaderName(cfg.column), 
					placeholder: 'Replacement text...' 
				});
				repInput.setCssStyles({ flex: '1' });
				repInput.disabled = !cfg.replacementEnabled;
				repInput.addEventListener('change', () => {
					cfg.replacement = repInput.value.trim();
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs.filter(c => c.column.trim())));
				});

				// Wikilink-able Toggle
				const wikiLabel = row.createEl('label');
				wikiLabel.setCssStyles({
					display: 'flex',
					alignItems: 'center',
					gap: '4px'
				});
				
				const wikiCheckbox = wikiLabel.createEl('input', {
					type: 'checkbox'
				});
				wikiCheckbox.checked = cfg.wikilinkEnabled;
				wikiLabel.createSpan({ text: 'Wikilink' });
				
				wikiCheckbox.addEventListener('change', () => {
					cfg.wikilinkEnabled = wikiCheckbox.checked;
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs.filter(c => c.column.trim())));
				});

				const deleteBtn = row.createEl('button', { text: 'Delete', cls: 'mod-warning' });
				deleteBtn.addEventListener('click', () => {
					configs.splice(index, 1);
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs));
					renderColumnList();
				});
			});

			const addRow = listContainer.createDiv({ cls: 'sqlseal-settings-column-row-add' });
			addRow.setCssStyles({
				display: 'flex',
				gap: '10px',
				marginTop: '12px'
			});

			const addInput = addRow.createEl('input', { type: 'text', placeholder: 'New column name...' });
			addInput.setCssStyles({ flex: '1' });
			const addInputSuggest = new GenericTextSuggest(this.app, addInput, []);

			const addBtn = addRow.createEl('button', { text: 'Add Column', cls: 'mod-cta' });
			const handleAdd = () => {
				const newVal = addInput.value.trim();
				if (newVal) {
					configs.push({
						column: newVal,
						replacementEnabled: true,
						replacement: formatHeaderName(newVal),
						wikilinkEnabled: true
					});
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs));
					renderColumnList();
				}
			};
			addBtn.addEventListener('click', handleAdd);
			addInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					handleAdd();
				}
			});

			const rescanBtn = addRow.createEl('button', { text: 'Rescan Vault' });
			rescanBtn.addEventListener('click', async () => {
				rescanBtn.disabled = true;
				rescanBtn.textContent = 'Scanning...';
				try {
					const scanned = await scanVaultColumns(this.app);
					new Notice(`Scanned vault and found ${scanned.length} columns!`);
					addInputSuggest.setItems(scanned);
					addInput.placeholder = 'Type column name or select from list...';
					addInput.focus();
				} catch {
					new Notice('Failed to scan vault columns');
				} finally {
					rescanBtn.disabled = false;
					rescanBtn.textContent = 'Rescan Vault';
				}
			});
		};

		renderColumnList();


        new Setting(containerEl).setName('Views').setHeading();
        new Setting(containerEl)
            .setName('Default View')
            .setDesc('This view will be used by default when you don\'t provide any view definition in your query')
            .addDropdown(dropdown => dropdown
                .addOption('grid', 'Grid')
                .addOption('html', 'HTML Table')
                .addOption('markdown', 'Markdown Table')
                .setValue(this.settings.get('defaultView'))
                .onChange(async (value: 'grid' | 'html' | 'markdown') => {
                    this.settings.set('defaultView', value ?? DEFAULT_SETTINGS.defaultView)
                    // await this.plugin.saveData(this.settings);
                    this.display();
                    // this.callChanges()
                }));
        new Setting(containerEl).setName('Grid View').setHeading();
        new Setting(containerEl)
            .setName('Items per page')
            .setDesc('How many items should display for each page of the Grid view (choose Unlimited for single-page virtualized lazy scroll).')
            .addDropdown(dropdown => dropdown
                .addOption('20', '20')
                .addOption('50', '50')
                .addOption('100', '100')
                .addOption('200', '200')
                .addOption('500', '500')
                .addOption('1000', '1000')
                .addOption('0', 'Unlimited (All / Virtualized)')
                .setValue(this.settings.get('gridItemsPerPage').toString())
                .onChange(async (value) => {
                    this.settings.set('gridItemsPerPage', parseInt(value, 10) ?? DEFAULT_SETTINGS.gridItemsPerPage);
                    this.display();
                }));
    }

    // private callChanges() {
    //     // this.onChangeFns.forEach(f => f(this.settings))
    // }

    onChange(fn: (settings: SQLSealSettings) => void) {
        this.settings.onChange(fn)
        // this.onChangeFns.push(fn)
    }
}

export const settingsTabFactory = (app: App, plugin: Plugin, settings: Settings) => {
    return new SQLSealSettingsTab(app, plugin, settings)
}

async function scanVaultColumns(app: App): Promise<string[]> {
	const files = app.vault.getFiles();
	const columnSet = new Set<string>();
	for (const file of files) {
		const ext = file.extension.toLowerCase();
		if (ext === 'csv' || ext === 'tsv') {
			try {
				const content = await app.vault.read(file);
				const delimiter = ext === 'tsv' ? '\t' : ',';
				const firstLine = content.split('\n')[0];
				if (firstLine) {
					const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
					headers.forEach(h => columnSet.add(h));
				}
			} catch (e) {
				console.error("Rescan: Failed to read file headers:", file.path, e);
			}
		} else if (ext === 'json' || ext === 'json5' || ext === 'jsonl') {
			try {
				const content = await app.vault.read(file);
				if (ext === 'jsonl') {
					const firstLine = content.split('\n')[0];
					if (firstLine) {
						const obj = JSON.parse(firstLine);
						Object.keys(obj).forEach(k => columnSet.add(k));
					}
				} else {
					const obj = JSON.parse(content);
					if (Array.isArray(obj) && obj[0]) {
						Object.keys(obj[0]).forEach(k => columnSet.add(k));
					} else if (typeof obj === 'object' && obj !== null) {
						Object.keys(obj).forEach(k => columnSet.add(k));
					}
				}
			} catch {
				// skip
			}
		}
	}
	return Array.from(columnSet).sort();
}