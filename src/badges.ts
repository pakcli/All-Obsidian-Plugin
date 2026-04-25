import { App, TAbstractFile, TFolder } from 'obsidian';
import * as path from 'path';
import { detectLink } from './detect';

type FileItem = { el: HTMLElement; selfEl?: HTMLElement };
type ExplorerView = { fileItems?: Record<string, FileItem> };

export class BadgeRenderer {
	private timer: number | null = null;

	constructor(private app: App, private vaultRoot: string) {}

	scheduleRefresh(delay = 250): void {
		if (this.timer != null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => this.refresh(), delay);
	}

	refresh(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
			const view = leaf.view as unknown as ExplorerView;
			const items = view.fileItems;
			if (!items) continue;
			for (const [vaultPath, item] of Object.entries(items)) {
				const target = item.selfEl ?? item.el;
				const af = this.app.vault.getAbstractFileByPath(vaultPath);
				if (!(af instanceof TFolder)) {
					this.clear(target);
					continue;
				}
				const absPath = path.join(this.vaultRoot, af.path);
				const state = detectLink(absPath);
				this.apply(target, state.kind, state.kind === 'active' ? state.type : undefined);
			}
		}
	}

	clearAll(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
			const view = leaf.view as unknown as ExplorerView;
			const items = view.fileItems;
			if (!items) continue;
			for (const item of Object.values(items)) this.clear(item.selfEl ?? item.el);
		}
	}

	private apply(el: HTMLElement, kind: 'none' | 'active' | 'broken', type?: 'junction' | 'symlink'): void {
		el.removeClasses(['sm-link-active', 'sm-link-broken', 'sm-link-junction', 'sm-link-symlink']);
		if (kind === 'active') {
			el.addClass('sm-link-active');
			if (type) el.addClass(`sm-link-${type}`);
		} else if (kind === 'broken') {
			el.addClass('sm-link-broken');
		}
	}

	private clear(el: HTMLElement): void {
		el.removeClasses(['sm-link-active', 'sm-link-broken', 'sm-link-junction', 'sm-link-symlink']);
	}

	notify(_file: TAbstractFile): void {
		this.scheduleRefresh();
	}
}
