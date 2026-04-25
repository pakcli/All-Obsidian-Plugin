import { App, PluginSettingTab, Setting } from 'obsidian';
import type SymlinkManagerPlugin from './main';

export interface SymlinkManagerSettings {
	/** Show 🟢🟠🔴 badges in the file explorer. */
	showBadges: boolean;
	/** Confirm before removing a link. */
	confirmDisconnect: boolean;
}

export const DEFAULT_SETTINGS: SymlinkManagerSettings = {
	showBadges: true,
	confirmDisconnect: true,
};

export class SymlinkManagerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: SymlinkManagerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Show status badges in file explorer')
			.setDesc('Color folders that contain a junction or symlink: green = junction, orange = symlink, red = broken.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showBadges).onChange(async (v) => {
					this.plugin.settings.showBadges = v;
					await this.plugin.saveSettings();
					this.plugin.applyBadgeSetting();
				})
			);

		new Setting(containerEl)
			.setName('Confirm before disconnect')
			.setDesc('Ask for confirmation before removing a link or running Disconnect + Copy.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.confirmDisconnect).onChange(async (v) => {
					this.plugin.settings.confirmDisconnect = v;
					await this.plugin.saveSettings();
				})
			);

		const tip = containerEl.createDiv({ cls: 'setting-item-description' });
		tip.createEl('p', {
			text: 'Tip: for Obsidian to index files inside a linked folder, enable "Detect all file extensions" and reload the vault if needed.',
		});
	}
}
