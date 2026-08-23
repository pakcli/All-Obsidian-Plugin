import { App, Modal, ButtonComponent } from 'obsidian';
import type { ConflictResolutionOption } from './ops';

export interface SymlinkConflictModalOptions {
	linkPath: string;
	targetPath: string;
	linkItemCount: number;
	targetItemCount: number;
	onResolve: (choice: ConflictResolutionOption) => Promise<void>;
}

export class SymlinkConflictModal extends Modal {
	private opts: SymlinkConflictModalOptions;

	constructor(app: App, opts: SymlinkConflictModalOptions) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		this.modalEl.addClass('symlink-conflict-modal');
		this.titleEl.setText('⚠️ Symlink Folder Conflict');
		const { contentEl } = this;
		contentEl.empty();

		const desc = contentEl.createDiv({ cls: 'setting-item-description' });
		desc.createEl('p', {
			text: 'The selected Vault folder already exists and contains files, while the External target folder also exists.',
		});

		const summaryBox = contentEl.createDiv({ cls: 'sm-card', attr: { style: 'margin-bottom: 16px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px;' } });
		summaryBox.createDiv({
			cls: 'sm-card-title',
			text: `📁 Vault Folder (${this.opts.linkItemCount} items found):`,
			attr: { style: 'font-weight: 600; margin-bottom: 4px;' }
		});
		summaryBox.createDiv({
			cls: 'sm-card-desc',
			text: this.opts.linkPath,
			attr: { style: 'font-family: var(--font-monospace); font-size: 0.85em; color: var(--text-muted); word-break: break-all;' }
		});

		summaryBox.createDiv({
			cls: 'sm-card-title',
			text: `📁 External Target Folder (${this.opts.targetItemCount} items found):`,
			attr: { style: 'font-weight: 600; margin-top: 10px; margin-bottom: 4px;' }
		});
		summaryBox.createDiv({
			cls: 'sm-card-desc',
			text: this.opts.targetPath,
			attr: { style: 'font-family: var(--font-monospace); font-size: 0.85em; color: var(--text-muted); word-break: break-all;' }
		});

		contentEl.createEl('h4', { text: 'Choose Conflict Resolution:', attr: { style: 'margin: 16px 0 8px;' } });

		// Option A Card
		const cardA = contentEl.createDiv({ cls: 'sm-card', attr: { style: 'margin-bottom: 12px; background: var(--background-secondary); border: 1px solid var(--interactive-accent); border-radius: 8px; padding: 12px;' } });
		cardA.createDiv({
			cls: 'sm-card-title',
			text: '📦 Option A: Merge & Keep Vault Files into Target',
			attr: { style: 'font-weight: 700; color: var(--interactive-accent); margin-bottom: 4px;' }
		});
		cardA.createDiv({
			cls: 'sm-card-desc',
			text: 'Copies all files and subfolders from your Vault folder into the External target folder, removes the local folder, and creates the link. No files will be lost.',
			attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-bottom: 10px;' }
		});
		new ButtonComponent(cardA)
			.setButtonText('Option A: Merge into Target & Link')
			.setCta()
			.onClick(async () => {
				this.close();
				await this.opts.onResolve('merge-vault-to-target');
			});

		// Option B Card
		const cardB = contentEl.createDiv({ cls: 'sm-card', attr: { style: 'margin-bottom: 12px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px;' } });
		cardB.createDiv({
			cls: 'sm-card-title',
			text: '📂 Option B: Use External Target Directory (Replace Vault Folder)',
			attr: { style: 'font-weight: 700; color: var(--text-normal); margin-bottom: 4px;' }
		});
		cardB.createDiv({
			cls: 'sm-card-desc',
			text: 'Replaces the Vault folder with the link pointing to the External folder. The external files will become active in your vault.',
			attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-bottom: 10px;' }
		});
		new ButtonComponent(cardB)
			.setButtonText('Option B: Replace Vault Folder & Link')
			.setWarning()
			.onClick(async () => {
				this.close();
				await this.opts.onResolve('replace-vault-with-target');
			});

		const footer = contentEl.createDiv({ cls: 'sm-actions', attr: { style: 'margin-top: 16px; display: flex; justify-content: flex-end;' } });
		new ButtonComponent(footer)
			.setButtonText('Cancel')
			.onClick(() => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
