import { FileSystemAdapter, Menu, Notice, Plugin, TAbstractFile, TFolder } from 'obsidian';
import { BadgeRenderer } from './badges';
import { SymlinkModal } from './modal';
import { DEFAULT_SETTINGS, SymlinkManagerSettings, SymlinkManagerSettingTab } from './settings';

export default class SymlinkManagerPlugin extends Plugin {
	settings!: SymlinkManagerSettings;
	private badges: BadgeRenderer | null = null;
	private vaultRoot = '';

	async onload(): Promise<void> {
		await this.loadSettings();

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice('Symlink Manager: this plugin only runs on Obsidian desktop.');
			return;
		}
		this.vaultRoot = adapter.getBasePath();

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
			})
		);

		this.app.workspace.onLayoutReady(() => this.applyBadgeSetting());

		// Folder rename/create/delete can change link state visible in the tree.
		this.registerEvent(this.app.vault.on('create', (f) => this.badges?.notify(f)));
		this.registerEvent(this.app.vault.on('delete', (f) => this.badges?.notify(f)));
		this.registerEvent(this.app.vault.on('rename', (f) => this.badges?.notify(f)));

		this.addSettingTab(new SymlinkManagerSettingTab(this.app, this));
	}

	onunload(): void {
		this.badges?.clearAll();
		this.badges = null;
	}

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

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SymlinkManagerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
