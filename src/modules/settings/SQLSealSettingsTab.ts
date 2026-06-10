import { App, PluginSettingTab, Setting, Plugin, Notice } from 'obsidian';
import { SettingsModule } from './module';
import { Settings } from './Settings';
import { SettingsControls } from './settingsTabSection/SettingsControls';

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
    autocompleteColumns: 'item_name, merchant'
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

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.controls.forEach(c => {
            c.display(containerEl.createDiv())
        })


        containerEl.createEl('h3', { text: 'Behavior' });
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
		containerEl.createEl('h3', { text: 'Autocomplete & Wikilink Columns' });
		containerEl.createEl('p', { 
			text: 'Configure columns that will have autocomplete suggestions (based on values in the column) and behave as Ctrl+Click wikilinks without requiring brackets [[ ]].',
			cls: 'setting-item-description'
		});

		const listContainer = containerEl.createDiv({ cls: 'sqlseal-settings-columns-list' });

		const renderColumnList = () => {
			listContainer.empty();
			const cols = (this.settings.get('autocompleteColumns' as any) || '')
				.split(',')
				.map((s: string) => s.trim())
				.filter(Boolean);

			cols.forEach((col: string, index: number) => {
				const row = listContainer.createDiv({ cls: 'sqlseal-settings-column-row' });
				row.style.display = 'flex';
				row.style.alignItems = 'center';
				row.style.gap = '10px';
				row.style.marginBottom = '8px';

				const input = row.createEl('input', { type: 'text', value: col });
				input.style.flex = '1';
				input.addEventListener('change', () => {
					cols[index] = input.value.trim();
					this.settings.set('autocompleteColumns' as any, cols.filter(Boolean).join(', '));
				});

				const deleteBtn = row.createEl('button', { text: 'Delete', cls: 'mod-warning' });
				deleteBtn.addEventListener('click', () => {
					cols.splice(index, 1);
					this.settings.set('autocompleteColumns' as any, cols.filter(Boolean).join(', '));
					renderColumnList();
				});
			});

			const addRow = listContainer.createDiv({ cls: 'sqlseal-settings-column-row-add' });
			addRow.style.display = 'flex';
			addRow.style.gap = '10px';
			addRow.style.marginTop = '12px';

			const addInput = addRow.createEl('input', { type: 'text', placeholder: 'New column name...' });
			addInput.style.flex = '1';

			const addBtn = addRow.createEl('button', { text: 'Add Column', cls: 'mod-cta' });
			const handleAdd = () => {
				const newVal = addInput.value.trim();
				if (newVal) {
					cols.push(newVal);
					this.settings.set('autocompleteColumns' as any, cols.filter(Boolean).join(', '));
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
					
					const dlId = 'scanned-cols-dl';
					let dl = listContainer.querySelector('#' + dlId) as HTMLDataListElement;
					if (!dl) {
						dl = listContainer.createEl('datalist');
						dl.id = dlId;
					}
					dl.empty();
					scanned.forEach(colName => {
						const opt = dl.createEl('option');
						opt.value = colName;
					});
					addInput.setAttribute('list', dlId);
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


        containerEl.createEl('h3', { text: 'Views' });
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
        containerEl.createEl('h4', { text: 'Grid View' });
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