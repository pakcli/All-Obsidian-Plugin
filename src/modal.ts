import {
	App,
	ButtonComponent,
	DropdownComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
	normalizePath,
} from 'obsidian';
import * as path from 'path';
import { detectLink, suggestLinkType } from './detect';
import { copyAndDisconnect, createLink, removeLink, repointLink } from './ops';
import { browseFolder } from './dialog';
import { applyResponsivePath } from './truncate';
import type { LinkInfo, LinkType } from './types';

export interface SymlinkModalOptions {
	vaultRoot: string;
	initialVaultPath: string;
	confirmDisconnect: boolean;
	onChange?: () => void;
}

export class SymlinkModal extends Modal {
	private opts: SymlinkModalOptions;
	private info!: LinkInfo;
	private vaultPathInput!: TextComponent;
	private statusEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private debugEl!: HTMLElement;
	private disposers: Array<() => void> = [];

	constructor(app: App, opts: SymlinkModalOptions) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		this.modalEl.addClass('symlink-manager-modal');
		this.titleEl.setText('Symlink Manager');
		this.contentEl.empty();

		const headerWrap = this.contentEl.createDiv({ cls: 'sm-section' });
		new Setting(headerWrap)
			.setName('Folder (vault)')
			.setDesc('Editable — relative to vault root')
			.addText((t) => {
				this.vaultPathInput = t;
				t.setPlaceholder('_project/MyProject');
				t.setValue(this.opts.initialVaultPath);
				t.onChange(() => this.refresh());
			});

		this.statusEl = this.contentEl.createDiv({ cls: 'sm-status' });
		this.bodyEl = this.contentEl.createDiv({ cls: 'sm-body' });
		this.debugEl = this.contentEl.createDiv({ cls: 'sm-debug' });

		this.refresh();
	}

	onClose(): void {
		this.disposeAll();
		this.contentEl.empty();
	}

	private disposeAll(): void {
		for (const d of this.disposers) {
			try { d(); } catch { /* ignore */ }
		}
		this.disposers = [];
	}

	private refresh(): void {
		const raw = this.vaultPathInput.getValue().trim();
		const vaultPath = normalizePath(raw || this.opts.initialVaultPath || '/');
		const absPath = path.join(this.opts.vaultRoot, vaultPath);
		this.info = { absPath, vaultPath, state: detectLink(absPath) };

		this.hideDebug();
		this.renderStatus();
		this.renderBody();
	}

	private renderStatus(): void {
		// New status DOM removes any prior ResizeObservers it may have hooked up.
		this.disposeAll();
		this.statusEl.empty();

		const s = this.info.state;

		const line = this.statusEl.createDiv({ cls: 'sm-status-line' });
		const dotKind = s.kind === 'active' ? s.type : s.kind === 'broken' ? 'broken' : 'none';
		line.createSpan({ cls: `sm-dot sm-dot-${dotKind}` });

		const label = line.createSpan({ cls: 'sm-status-label' });
		label.setText(statusLabel(s));

		if (s.kind === 'none') return;

		const targetRow = this.statusEl.createDiv({ cls: 'sm-target-row' });
		targetRow.createSpan({ cls: 'sm-target-arrow', text: '→' });
		const pathEl = targetRow.createSpan({ cls: 'sm-target-path' });
		this.disposers.push(applyResponsivePath(pathEl, s.target));

		if (s.kind === 'broken') {
			this.statusEl.createDiv({
				cls: 'sm-warn',
				text: '⚠️ Target not found / drive offline.',
			});
		}
	}

	private renderBody(): void {
		this.bodyEl.empty();
		switch (this.info.state.kind) {
			case 'none':
				this.renderCreate();
				return;
			case 'active':
				this.renderActive();
				return;
			case 'broken':
				this.renderBroken();
				return;
		}
	}

	// ── State A: create ────────────────────────────────────────────────
	private renderCreate(): void {
		let targetInput!: TextComponent;
		let typeDropdown!: DropdownComponent;
		let typeRow!: Setting;
		let chosenType: LinkType = 'junction';

		const setType = (t: LinkType): void => {
			chosenType = t;
			typeDropdown.setValue(t);
			typeRow.setDesc(typeHint(t));
		};

		new Setting(this.bodyEl)
			.setName('External path')
			.setDesc('Type a path or use Browse')
			.addText((t) => {
				targetInput = t;
				t.setPlaceholder('D:\\Projects\\MyProject');
				t.onChange((v) => {
					if (!v.trim()) return;
					setType(suggestLinkType(this.info.absPath, v.trim()));
				});
			})
			.addButton((b) =>
				b.setButtonText('Browse').onClick(async () => {
					const picked = await browseFolder();
					if (picked) {
						targetInput.setValue(picked);
						setType(suggestLinkType(this.info.absPath, picked));
					}
				})
			);

		typeRow = new Setting(this.bodyEl)
			.setName('Link type')
			.setDesc(typeHint(chosenType))
			.addDropdown((d) => {
				typeDropdown = d;
				d.addOption('junction', 'Junction (Windows · same drive · no admin)');
				d.addOption('symlink', 'Symlink (cross-drive / POSIX · admin on Win)');
				d.setValue(chosenType);
				d.onChange((v) => {
					chosenType = v as LinkType;
					typeRow.setDesc(typeHint(chosenType));
				});
			});

		const actions = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());
		new ButtonComponent(actions)
			.setButtonText('Create link')
			.setCta()
			.onClick(() => {
				const target = targetInput.getValue().trim();
				if (!target) {
					new Notice('Pick a target folder first.');
					return;
				}
				void this.guard(async () => {
					await createLink(this.info.absPath, target, chosenType);
					new Notice(`Link created → ${target}`);
				});
			});
	}

	// ── State B: active ────────────────────────────────────────────────
	private renderActive(): void {
		const s = this.info.state;
		if (s.kind !== 'active') return;

		new Setting(this.bodyEl)
			.setName('Target path')
			.setDesc(s.target)
			.addButton((b) =>
				b.setButtonText('Edit target').onClick(() => {
					this.bodyEl.empty();
					this.renderEditTarget(s.target, s.type);
				})
			);

		this.bodyEl.createEl('h4', { text: 'Actions', cls: 'sm-actions-title' });

		const disconnectCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		disconnectCard.createDiv({ cls: 'sm-card-title', text: '🔌 Disconnect' });
		disconnectCard.createDiv({
			cls: 'sm-card-desc',
			text: 'Remove the link only — files at the target are untouched.',
		});
		new ButtonComponent(disconnectCard)
			.setButtonText('Disconnect')
			.setWarning()
			.onClick(() => {
				if (!this.confirm('Remove the link? Files at the target stay where they are.')) return;
				void this.guard(async () => {
					const t0 = performance.now();
					this.showDebug('Disconnecting…');
					await removeLink(this.info.absPath);
					this.showDebug(`Disconnected. (${elapsed(t0)})`);
					new Notice(`Link removed. (${elapsed(t0)})`);
				});
			});

		const copyCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		copyCard.createDiv({ cls: 'sm-card-title', text: '📦 Disconnect + Copy' });
		copyCard.createDiv({
			cls: 'sm-card-desc',
			text: 'Copy contents into the vault first, then remove the link. Large folders may take a while.',
		});
		new ButtonComponent(copyCard)
			.setButtonText('Copy & disconnect')
			.onClick(() => {
				if (!this.confirm('Copy contents into the vault and then disconnect?')) return;
				void this.guard(async () => {
					const t0 = performance.now();
					this.showDebug('Copying… ⏳');
					new Notice('Copying — this may take a while…');
					await copyAndDisconnect(this.info.absPath);
					const dur = elapsed(t0);
					this.showDebug(`Copied and detached. (${dur})`);
					new Notice(`Copied and detached. (${dur})`);
				});
			});

		const close = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(close).setButtonText('Close').onClick(() => this.close());
	}

	private renderEditTarget(current: string, initialType: LinkType): void {
		let targetInput!: TextComponent;
		let chosenType: LinkType = initialType;

		new Setting(this.bodyEl)
			.setName('New target path')
			.addText((t) => {
				targetInput = t;
				t.setValue(current);
				t.onChange((v) => {
					if (!v.trim()) return;
					chosenType = suggestLinkType(this.info.absPath, v.trim());
				});
			})
			.addButton((b) =>
				b.setButtonText('Browse').onClick(async () => {
					const picked = await browseFolder(targetInput.getValue() || undefined);
					if (picked) {
						targetInput.setValue(picked);
						chosenType = suggestLinkType(this.info.absPath, picked);
					}
				})
			);

		const actions = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.refresh());
		new ButtonComponent(actions)
			.setButtonText('Apply')
			.setCta()
			.onClick(() => {
				const v = targetInput.getValue().trim();
				if (!v) {
					new Notice('Target path is empty.');
					return;
				}
				void this.guard(async () => {
					await repointLink(this.info.absPath, v, chosenType);
					new Notice('Target updated.');
				});
			});
	}

	// ── State C: broken ────────────────────────────────────────────────
	private renderBroken(): void {
		this.bodyEl.createEl('h4', { text: 'Actions', cls: 'sm-actions-title' });

		const removeCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		removeCard.createDiv({ cls: 'sm-card-title', text: '🔌 Remove broken link' });
		removeCard.createDiv({ cls: 'sm-card-desc', text: 'Delete the dangling pointer. No data is lost.' });
		new ButtonComponent(removeCard)
			.setButtonText('Remove')
			.setWarning()
			.onClick(() => {
				if (!this.confirm('Remove the broken link pointer?')) return;
				void this.guard(async () => {
					await removeLink(this.info.absPath);
					new Notice('Broken link removed.');
				});
			});

		const repointCard = this.bodyEl.createDiv({ cls: 'sm-card' });
		repointCard.createDiv({ cls: 'sm-card-title', text: '🔁 Repoint to new path' });
		repointCard.createDiv({ cls: 'sm-card-desc', text: 'Pick a new target and re-create the link in place.' });

		let targetInput!: TextComponent;
		let chosenType: LinkType = 'junction';
		const startTarget = this.info.state.kind === 'broken' ? this.info.state.target : '';

		new Setting(repointCard)
			.setName('New target')
			.addText((t) => {
				targetInput = t;
				t.setValue(startTarget);
				t.onChange((v) => {
					if (!v.trim()) return;
					chosenType = suggestLinkType(this.info.absPath, v.trim());
				});
			})
			.addButton((b) =>
				b.setButtonText('Browse').onClick(async () => {
					const picked = await browseFolder(targetInput.getValue() || undefined);
					if (picked) {
						targetInput.setValue(picked);
						chosenType = suggestLinkType(this.info.absPath, picked);
					}
				})
			);

		new ButtonComponent(repointCard)
			.setButtonText('Repoint')
			.setCta()
			.onClick(() => {
				const v = targetInput.getValue().trim();
				if (!v) {
					new Notice('Pick a target first.');
					return;
				}
				void this.guard(async () => {
					await repointLink(this.info.absPath, v, chosenType);
					new Notice('Repointed.');
				});
			});

		const close = this.bodyEl.createDiv({ cls: 'sm-actions' });
		new ButtonComponent(close).setButtonText('Close').onClick(() => this.close());
	}

	private confirm(message: string): boolean {
		if (!this.opts.confirmDisconnect) return true;
		return window.confirm(message);
	}

	private showDebug(msg: string): void {
		this.debugEl.setText(msg);
		this.debugEl.addClass('sm-debug-visible');
	}

	private hideDebug(): void {
		this.debugEl.empty();
		this.debugEl.removeClass('sm-debug-visible');
	}

	private async guard(fn: () => Promise<void>): Promise<void> {
		try {
			await fn();
			this.opts.onChange?.();
			this.refresh();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showDebug(`Error: ${msg}`);
			new Notice(`Symlink Manager: ${msg}`, 8000);
		}
	}
}

function typeHint(type: LinkType): string {
	if (type === 'junction') return 'Same drive — junction, no admin required.';
	return 'Cross-drive or POSIX — symlink (admin required on Windows).';
}

function statusLabel(s: LinkInfo['state']): string {
	if (s.kind === 'none') return 'No symlink detected';
	if (s.kind === 'broken') return 'Broken link detected';
	return s.type === 'junction' ? 'Junction active' : 'Symlink active';
}

/** Human-readable elapsed time from a performance.now() timestamp. */
function elapsed(t0: number): string {
	const ms = performance.now() - t0;
	return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
