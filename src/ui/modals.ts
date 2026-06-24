import { App, Modal, ButtonComponent } from 'obsidian';
import { FolderRule } from '../types';

/**
 * Standard confirmation modal
 */
export class ConfirmModal extends Modal {
	message: string;
	onConfirm: () => void;
	onCancel?: () => void;

	constructor(app: App, message: string, onConfirm: () => void, onCancel?: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
		this.onCancel = onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Confirm Action' });
		contentEl.createEl('p', { text: this.message });

		const btnContainer = contentEl.createDiv();
		btnContainer.style.display = 'flex';
		btnContainer.style.justifyContent = 'flex-end';
		btnContainer.style.marginTop = '20px';

		new ButtonComponent(btnContainer)
			.setButtonText('Confirm')
			.setCta()
			.onClick(() => {
				this.onConfirm();
				this.close();
			});

		const cancelBtn = new ButtonComponent(btnContainer)
			.setButtonText('Cancel')
			.onClick(() => {
				if (this.onCancel) this.onCancel();
				this.close();
			});
		cancelBtn.buttonEl.style.marginLeft = '10px';
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Conflict/Overwrite confirmation modal
 */
export class ConflictModal extends Modal {
	conflicts: FolderRule[];
	onSubmit: (overwrite: boolean) => void;

	constructor(app: App, conflicts: FolderRule[], onSubmit: (overwrite: boolean) => void) {
		super(app);
		this.conflicts = conflicts;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Overwrite Child Folder Rules?' });
		contentEl.createEl('p', { text: 'The following subfolders already have specific routing rules:' });

		const ul = contentEl.createEl('ul');
		this.conflicts.forEach(c => {
			ul.createEl('li', { text: c.path });
		});

		contentEl.createEl('p', { text: 'Do you want to overwrite these rules so they inherit the parent folder\'s behavior, or keep them separate?' });

		const btnContainer = contentEl.createDiv();
		btnContainer.style.display = 'flex';
		btnContainer.style.justifyContent = 'flex-end';
		btnContainer.style.marginTop = '20px';

		new ButtonComponent(btnContainer)
			.setButtonText('Overwrite Rules')
			.setCta()
			.onClick(() => {
				this.onSubmit(true);
				this.close();
			});

		const cancelBtn = new ButtonComponent(btnContainer)
			.setButtonText('Keep Child Rules')
			.onClick(() => {
				this.onSubmit(false);
				this.close();
			});
		cancelBtn.buttonEl.style.marginLeft = '10px';
	}

	onClose() {
		this.contentEl.empty();
	}
}
