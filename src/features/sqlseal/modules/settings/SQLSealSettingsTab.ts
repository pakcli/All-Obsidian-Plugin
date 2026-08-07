import { App, PluginSettingTab, Setting, Plugin, Notice, TFolder } from 'obsidian';
import { SettingsModule } from './module';
import { Settings } from './Settings';
import { SettingsControls } from './settingsTabSection/SettingsControls';
import { parseAutocompleteSettings, formatHeaderName } from '../../utils/views';
import { CsvFileSuggest, FolderSuggest, GenericTextSuggest } from '../../utils/suggesters';

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
				row.style.display = 'flex';
				row.style.alignItems = 'center';
				row.style.gap = '10px';
				row.style.marginBottom = '8px';

				// Column Name input
				const colInput = row.createEl('input', { 
					type: 'text', 
					value: cfg.column, 
					placeholder: 'Column name...' 
				});
				colInput.style.flex = '1';
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
				repLabel.style.display = 'flex';
				repLabel.style.alignItems = 'center';
				repLabel.style.gap = '4px';
				
				const repCheckbox = repLabel.createEl('input', {
					type: 'checkbox'
				});
				repCheckbox.checked = cfg.replacementEnabled;
				repLabel.createSpan({ text: 'Replace' });
				
				repCheckbox.addEventListener('change', () => {
					cfg.replacementEnabled = repCheckbox.checked;
					repInput.disabled = !cfg.replacementEnabled;
					if (cfg.replacementEnabled && !cfg.replacement.trim()) {
						repInput.value = formatHeaderName(cfg.column);
						cfg.replacement = repInput.value;
					}
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs.filter(c => c.column.trim())));
				});

				// Replacement Text input
				const repInput = row.createEl('input', { 
					type: 'text', 
					value: cfg.replacement || formatHeaderName(cfg.column), 
					placeholder: 'Replacement text...' 
				});
				repInput.style.flex = '1';
				repInput.disabled = !cfg.replacementEnabled;
				repInput.addEventListener('change', () => {
					cfg.replacement = repInput.value.trim();
					this.settings.set('autocompleteColumns' as any, JSON.stringify(configs.filter(c => c.column.trim())));
				});

				// Wikilink-able Toggle
				const wikiLabel = row.createEl('label');
				wikiLabel.style.display = 'flex';
				wikiLabel.style.alignItems = 'center';
				wikiLabel.style.gap = '4px';
				
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
			addRow.style.display = 'flex';
			addRow.style.gap = '10px';
			addRow.style.marginTop = '12px';

			const addInput = addRow.createEl('input', { type: 'text', placeholder: 'New column name...' });
			addInput.style.flex = '1';
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
				} catch (err) {
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
            .setName('Items per page ')
            .setDesc('How many items should display for each page of the Grid view')
            .addDropdown(dropdown => dropdown
                .addOption('20', '20')
                .addOption('50', '50')
                .addOption('100', '100')
                .setValue(this.settings.get('gridItemsPerPage').toString())
                .onChange(async (value) => {
                    this.settings.set('gridItemsPerPage', parseInt(value, 10) ?? DEFAULT_SETTINGS.gridItemsPerPage)
                    // await this.plugin.saveData(this.settings);
                    this.display();
                    // this.callChanges()
                }));

        new Setting(containerEl).setName('Receipt Scanner Autocomplete Suggestions').setHeading();
        containerEl.createEl('p', {
            text: 'Configure the source CSV files and columns used to populate autocomplete suggestions for Merchant and Category fields in the Receipt Scanner.',
            cls: 'setting-item-description'
        });

        const tableContainer = containerEl.createDiv();
        tableContainer.style.margin = '12px 0';
        tableContainer.style.overflowX = 'auto';

        const table = tableContainer.createEl('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.border = '1px solid var(--background-modifier-border)';

        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.style.backgroundColor = 'var(--background-secondary)';
        headerRow.style.borderBottom = '2px solid var(--background-modifier-border)';

        const thStyle = 'padding: 8px 12px; font-weight: bold; text-align: left; border-right: 1px solid var(--background-modifier-border);';
        
        const thSuggestion = headerRow.createEl('th');
        thSuggestion.setAttribute('style', thStyle);
        thSuggestion.style.width = '120px';
        thSuggestion.setText('Suggestion');

        const thPath = headerRow.createEl('th');
        thPath.setAttribute('style', thStyle);
        thPath.setText('CSV File Path');

        const thCol = headerRow.createEl('th');
        thCol.setAttribute('style', thStyle);
        thCol.style.width = '180px';
        thCol.setText('Column Name');

        const tbody = table.createEl('tbody');
        const tdStyle = 'padding: 8px 12px; border-bottom: 1px solid var(--background-modifier-border); border-right: 1px solid var(--background-modifier-border);';

        const readCSVHeaders = async (filePath: string): Promise<string[]> => {
            if (!filePath) return [];
            try {
                const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
                if (abstractFile && (abstractFile as any).extension) {
                    const content = await this.app.vault.read(abstractFile as any);
                    const ext = (abstractFile as any).extension.toLowerCase();
                    const delimiter = ext === 'tsv' ? '\t' : ',';
                    const firstLine = content.split('\n')[0];
                    if (firstLine) {
                        return firstLine.split(delimiter)
                            .map(h => h.trim().replace(/^["']|["']$/g, ''))
                            .filter(Boolean);
                    }
                }
            } catch (e) {
                console.error("Failed to read headers for autocomplete:", filePath, e);
            }
            return [];
        };

        // Merchant Row
        const rowMerchant = tbody.createEl('tr');
        
        const tdMerchantLabel = rowMerchant.createEl('td');
        tdMerchantLabel.setAttribute('style', tdStyle);
        tdMerchantLabel.style.fontWeight = 'bold';
        tdMerchantLabel.setText('Merchant');

        const tdMerchantPath = rowMerchant.createEl('td');
        tdMerchantPath.setAttribute('style', tdStyle);
        const inputMerchantPath = tdMerchantPath.createEl('input', { type: 'text' });
        inputMerchantPath.style.width = '100%';
        inputMerchantPath.value = this.settings.get('scannerMerchantPath') || '';
        inputMerchantPath.placeholder = 'e.g. Finance/merchants.csv';
        new CsvFileSuggest(this.app, inputMerchantPath);
        inputMerchantPath.addEventListener('change', async () => {
            this.settings.set('scannerMerchantPath', inputMerchantPath.value.trim());
            if ((this.plugin as any).saveSettings) {
                await (this.plugin as any).saveSettings();
            }
            await updateMerchantColumns();
        });

        const tdMerchantCol = rowMerchant.createEl('td');
        tdMerchantCol.setAttribute('style', tdStyle);
        const inputMerchantCol = tdMerchantCol.createEl('input', { type: 'text' });
        inputMerchantCol.style.width = '100%';
        inputMerchantCol.value = this.settings.get('scannerMerchantCol') || '';
        inputMerchantCol.placeholder = 'e.g. merchant';
        const merchantColSuggest = new GenericTextSuggest(this.app, inputMerchantCol, []);
        inputMerchantCol.addEventListener('change', async () => {
            this.settings.set('scannerMerchantCol', inputMerchantCol.value.trim());
            if ((this.plugin as any).saveSettings) {
                await (this.plugin as any).saveSettings();
            }
        });

        const updateMerchantColumns = async () => {
            const path = inputMerchantPath.value.trim();
            const headers = await readCSVHeaders(path);
            merchantColSuggest.setItems(headers);
        };
        inputMerchantPath.addEventListener('focus', updateMerchantColumns);

        // Category Row
        const rowCategory = tbody.createEl('tr');

        const tdCategoryLabel = rowCategory.createEl('td');
        tdCategoryLabel.setAttribute('style', tdStyle);
        tdCategoryLabel.style.fontWeight = 'bold';
        tdCategoryLabel.setText('Category');

        const tdCategoryPath = rowCategory.createEl('td');
        tdCategoryPath.setAttribute('style', tdStyle);
        const inputCategoryPath = tdCategoryPath.createEl('input', { type: 'text' });
        inputCategoryPath.style.width = '100%';
        inputCategoryPath.value = this.settings.get('scannerCategoryPath') || '';
        inputCategoryPath.placeholder = 'e.g. Finance/budget.csv';
        new CsvFileSuggest(this.app, inputCategoryPath);
        inputCategoryPath.addEventListener('change', async () => {
            this.settings.set('scannerCategoryPath', inputCategoryPath.value.trim());
            if ((this.plugin as any).saveSettings) {
                await (this.plugin as any).saveSettings();
            }
            await updateCategoryColumns();
        });

        const tdCategoryCol = rowCategory.createEl('td');
        tdCategoryCol.setAttribute('style', tdStyle);
        const inputCategoryCol = tdCategoryCol.createEl('input', { type: 'text' });
        inputCategoryCol.style.width = '100%';
        inputCategoryCol.value = this.settings.get('scannerCategoryCol') || '';
        inputCategoryCol.placeholder = 'e.g. category';
        const categoryColSuggest = new GenericTextSuggest(this.app, inputCategoryCol, []);
        inputCategoryCol.addEventListener('change', async () => {
            this.settings.set('scannerCategoryCol', inputCategoryCol.value.trim());
            if ((this.plugin as any).saveSettings) {
                await (this.plugin as any).saveSettings();
            }
        });

        const updateCategoryColumns = async () => {
            const path = inputCategoryPath.value.trim();
            const headers = await readCSVHeaders(path);
            categoryColSuggest.setItems(headers);
        };
        inputCategoryPath.addEventListener('focus', updateCategoryColumns);

        // Run initial columns loading
        setTimeout(() => {
            updateMerchantColumns();
            updateCategoryColumns();
        }, 50);

        // Receipt Scanner Folder & Save Behavior Settings
        new Setting(containerEl).setName('Receipt Scanner Folder & Save Behavior').setHeading();

        new Setting(containerEl)
            .setName('Finance Folder Path')
            .setDesc('Customize the folder where your transaction and ledger CSV files are saved. Autocomplete suggestions are loaded from folders in your vault.')
            .addText(text => {
                text.setValue(this.settings.get('scannerFinanceFolderPath') || 'Finance');
                text.setPlaceholder('e.g. Finance');
                new FolderSuggest(this.app, text.inputEl);
                text.inputEl.addEventListener('change', async () => {
                    const val = text.getValue().trim();
                    this.settings.set('scannerFinanceFolderPath', val);
                    if ((this.plugin as any).saveSettings) {
                        await (this.plugin as any).saveSettings();
                    }
                });
            });

        new Setting(containerEl)
            .setName('Clear Inputs After Save')
            .setDesc('If enabled, scanning inputs and draft contents will be cleared/emptied after saving the transaction to the CSV. Disable to keep the data in the form.')
            .addToggle(toggle => toggle
                .setValue(this.settings.get('scannerClearAfterSave') !== false)
                .onChange(async (value) => {
                    this.settings.set('scannerClearAfterSave', value);
                    if ((this.plugin as any).saveSettings) {
                        await (this.plugin as any).saveSettings();
                    }
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
			} catch (e) {
				// skip
			}
		}
	}
	return Array.from(columnSet).sort();
}