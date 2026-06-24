import { App, PluginSettingTab, Setting, ButtonComponent, Notice, normalizePath } from "obsidian";
import type TreeDiagramPlugin from "./main";
import { AssetRouterSettings, FolderRule, TitleOverrideOption } from "./types";
import { ConfirmModal, ConflictModal } from "./ui/modals";
import { FolderSuggest } from "./ui/folder-suggest";

export const DEFAULT_SETTINGS: AssetRouterSettings = {
	centralAssetFolderEnabled: true,
	centralAssetFolder: "assets",
	useNoteTitleGlobalCentral: false,
	useNoteTitleGlobalNested: false,
	rules: [],
	delimiter: "_",
	assetExtensions: ["png", "jpg", "jpeg", "gif", "svg", "pdf", "mp3", "mp4", "wav", "webm", "ogg", "m4a", "xls", "xlsx", "doc", "docx", "zip", "tar", "gz"],
};

export class AssetRouterSettingTab extends PluginSettingTab {
	plugin: TreeDiagramPlugin;

	constructor(app: App, plugin: TreeDiagramPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsidian Asset Router Settings' });

		// ==========================================
		// 1. Centralized Routing Settings
		// ==========================================
		containerEl.createEl('h3', { text: 'Centralized Mode (Default)' });

		new Setting(containerEl)
			.setName('Enable Centralized Routing')
			.setDesc('Route all attachments to a single global directory by default.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.centralAssetFolderEnabled)
				.onChange(async (value) => {
					this.plugin.settings.centralAssetFolderEnabled = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to toggle visibility of dependent settings
				}));

		if (this.plugin.settings.centralAssetFolderEnabled) {
			new Setting(containerEl)
				.setName('Central Asset Folder')
				.setDesc('Directory at the vault root where default assets will be saved.')
				.addText(text => {
					text.setPlaceholder('assets')
						.setValue(this.plugin.settings.centralAssetFolder)
						.onChange(async (value) => {
							this.plugin.settings.centralAssetFolder = value.trim() || 'assets';
							await this.plugin.saveSettings();
						});
					new FolderSuggest(this.app, text.inputEl);
				});

			new Setting(containerEl)
				.setName('Use Note Title in Centralized Mode')
				.setDesc('Use note frontmatter "title" property when renaming attachments instead of filename.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.useNoteTitleGlobalCentral)
					.onChange(async (value) => {
						this.plugin.settings.useNoteTitleGlobalCentral = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Rescan Centralized Assets')
				.setDesc('Scan the vault and organize all attachments for notes in Centralized Mode (excluding Captain Folders).')
				.addButton(button => button
					.setButtonText('Rescan Centralized')
					.onClick(async () => {
						button.setDisabled(true);
						await this.plugin.rescanCentralizedAssets();
						button.setDisabled(false);
					}));
		}

		// ==========================================
		// 2. Global Nested Mode Settings
		// ==========================================
		containerEl.createEl('h3', { text: 'Nested Mode Globals' });

		new Setting(containerEl)
			.setName('Use Note Title in Nested Mode (Default)')
			.setDesc('Default setting for Captain Folders to use frontmatter "title" property.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useNoteTitleGlobalNested)
				.onChange(async (value) => {
					this.plugin.settings.useNoteTitleGlobalNested = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Path Delimiter')
			.setDesc('Character used to join directories and file titles.')
			.addDropdown(dropdown => dropdown
				.addOption('-', '-')
				.addOption('_', '_')
				.setValue(this.plugin.settings.delimiter)
				.onChange(async (value) => {
					this.plugin.settings.delimiter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Monitored File Extensions')
			.setDesc('Comma-separated list of file extensions that the plugin should route.')
			.addTextArea(text => text
				.setPlaceholder('png, jpg, jpeg, pdf')
				.setValue(this.plugin.settings.assetExtensions.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.assetExtensions = value
						.split(',')
						.map(ext => ext.trim().toLowerCase())
						.filter(ext => ext !== '');
					await this.plugin.saveSettings();
				}));

		// ==========================================
		// 3. Captain Folders (Rules) Settings
		// ==========================================
		containerEl.createEl('h3', { text: 'Nested Mode Override Rules (Captain Folders)' });

		// Bulk operations
		const bulkContainer = containerEl.createDiv({ cls: 'asset-router-bulk-container' });
		bulkContainer.style.marginBottom = '10px';

		new ButtonComponent(bulkContainer)
			.setButtonText('Turn On All Rules')
			.setCta()
			.onClick(() => {
				new ConfirmModal(
					this.app,
					'Are you sure you want to enable ALL Captain Folder rules?',
					async () => {
						this.plugin.settings.rules.forEach(r => r.enabled = true);
						await this.plugin.saveSettings();
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
						this.plugin.settings.rules.forEach(r => r.enabled = false);
						await this.plugin.saveSettings();
						this.display();
						new Notice('All rules disabled');
					}
				).open();
			});
		turnOffBtn.buttonEl.style.marginLeft = '10px';

		const rescanAllBtn = new ButtonComponent(bulkContainer)
			.setButtonText('Rescan All Nested')
			.onClick(async () => {
				rescanAllBtn.setDisabled(true);
				await this.plugin.rescanAllNestedAssets();
				rescanAllBtn.setDisabled(false);
			});
		rescanAllBtn.buttonEl.style.marginLeft = '10px';

		// Form to add a new rule
		containerEl.createEl('h4', { text: 'Add New Captain Folder Rule' });
		const addRuleDiv = containerEl.createDiv();
		addRuleDiv.style.border = '1px solid var(--background-modifier-border)';
		addRuleDiv.style.padding = '15px';
		addRuleDiv.style.borderRadius = '8px';
		addRuleDiv.style.marginBottom = '20px';

		let newPath = '';
		let newScope = 'children'; // 'folder' | 'children'
		let newTitleOverride: TitleOverrideOption = 'inherit';

		new Setting(addRuleDiv)
			.setName('Folder Path')
			.setDesc('Relative path from vault root (e.g. folderb)')
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
				const existingIndex = this.plugin.settings.rules.findIndex(r => normalizePath(r.path) === normalizedPath);
				const isNestedScope = newScope === 'children';

				const newRule: FolderRule = {
					path: normalizedPath,
					isNested: true,
					includeChildren: isNestedScope,
					useNoteTitle: newTitleOverride,
					enabled: true
				};

				if (isNestedScope) {
					// Check conflicts: subfolders that already have specific rules
					const conflicts = this.plugin.settings.rules.filter(r => {
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
									this.plugin.settings.rules = this.plugin.settings.rules.filter(r => {
										const childPath = normalizePath(r.path);
										return !(childPath !== normalizedPath && childPath.startsWith(normalizedPath + '/'));
									});
								}
								this.addOrUpdateRule(newRule, existingIndex);
							}
						).open();
						return;
					}
				}

				this.addOrUpdateRule(newRule, existingIndex);
			});

		// Rules List / Table
		containerEl.createEl('h4', { text: 'Active Rules' });
		if (this.plugin.settings.rules.length === 0) {
			containerEl.createEl('p', { text: 'No active Captain Folder rules defined.', cls: 'empty-rules' });
			return;
		}

		const rulesTable = containerEl.createDiv({ cls: 'asset-router-rules-table' });
		rulesTable.style.width = '100%';

		this.plugin.settings.rules.forEach((rule, idx) => {
			const row = rulesTable.createDiv();
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';
			row.style.alignItems = 'center';
			row.style.padding = '10px';
			row.style.borderBottom = '1px solid var(--background-modifier-border)';
			if (!rule.enabled) {
				row.style.opacity = '0.5';
			}

			// Details
			const details = row.createDiv();
			details.style.flex = '1';
			const pathEl = details.createEl('strong', { text: rule.path === "" ? "/" : rule.path });
			pathEl.style.fontSize = '1.1em';
			
			const metaText = `Scope: ${rule.includeChildren ? 'Include Children' : 'Folder Only'} | Title: ${rule.useNoteTitle}`;
			details.createEl('div', { text: metaText, cls: 'setting-item-description' });

			// Controls
			const controls = row.createDiv();
			controls.style.display = 'flex';
			controls.style.alignItems = 'center';

			// Individual Rule Switch
			const switchContainer = controls.createDiv();
			switchContainer.style.marginRight = '15px';
			
			const toggle = switchContainer.createEl('input', { type: 'checkbox' });
			toggle.checked = rule.enabled;
			toggle.addEventListener('change', async () => {
				rule.enabled = toggle.checked;
				await this.plugin.saveSettings();
				this.display(); // Refresh view
			});

			// Rescan button
			const rescanBtn = new ButtonComponent(controls)
				.setButtonText('Rescan')
				.onClick(async () => {
					rescanBtn.setDisabled(true);
					await this.plugin.rescanFolderRuleAssets(rule);
					rescanBtn.setDisabled(false);
				});
			rescanBtn.buttonEl.style.marginRight = '10px';

			// Delete button
			new ButtonComponent(controls)
				.setButtonText('Remove')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.rules.splice(idx, 1);
					await this.plugin.saveSettings();
					this.display();
					new Notice('Rule removed.');
				});
		});
	}

	private async addOrUpdateRule(rule: FolderRule, existingIndex: number) {
		if (existingIndex !== -1) {
			this.plugin.settings.rules.splice(existingIndex, 1, rule);
			new Notice('Updated rule for ' + rule.path);
		} else {
			this.plugin.settings.rules.push(rule);
			new Notice('Added rule for ' + rule.path);
		}
		await this.plugin.saveSettings();
		this.display();
	}
}
