import { App, PluginSettingTab, Setting } from 'obsidian';

export interface SymlinkManagerSettings {
	/** Show 🟢🟠🔴 badges in the file explorer. */
	showBadges: boolean;
	/** Confirm before removing a link. */
	confirmDisconnect: boolean;
}

export const DEFAULT_SYMLINK_SETTINGS: SymlinkManagerSettings = {
	showBadges: true,
	confirmDisconnect: true,
};

export class SymlinkManagerSettingTab extends PluginSettingTab {
	constructor(
        app: App,
        plugin: any,
        private settings: SymlinkManagerSettings,
        private saveSettings: () => Promise<void>,
        private applyBadgeSetting: () => void
    ) {
		super(app, plugin);
	}

	display(containerEl: HTMLElement = this.containerEl): void {
		containerEl.empty();

		new Setting(containerEl)
			.setName('Show status badges in file explorer')
			.setDesc('Color folders that contain a junction or symlink: green = junction, orange = symlink, red = broken.')
			.addToggle((t) =>
				t.setValue(this.settings.showBadges).onChange(async (v) => {
					this.settings.showBadges = v;
					await this.saveSettings();
					this.applyBadgeSetting();
				})
			);

		new Setting(containerEl)
			.setName('Confirm before disconnect')
			.setDesc('Ask for confirmation before removing a link or running Disconnect + Copy.')
			.addToggle((t) =>
				t.setValue(this.settings.confirmDisconnect).onChange(async (v) => {
					this.settings.confirmDisconnect = v;
					await this.saveSettings();
				})
			);

		const tip = containerEl.createDiv({ cls: 'setting-item-description' });
		tip.createEl('p', {
			text: 'Tip: for Obsidian to index files inside a linked folder, enable "Detect all file extensions" and reload the vault if needed.',
		});
	}
}
