import { App, TAbstractFile, TFolder } from 'obsidian';
import { join } from 'path';
import { detectLink } from './detect';
import { applyResponsivePath } from './truncate';

type FileItem = { el: HTMLElement; selfEl?: HTMLElement };
type ExplorerView = { fileItems?: Record<string, FileItem> };

const DOT_CLS  = 'sm-dot-badge';
const PATH_CLS = 'sm-path-badge';

/**
 * Row layout after injection:
 *
 *   [collapse-icon] [folder-name] ··· [target-path right-aligned] [●]
 *
 *   .nav-folder-title-content  flex: 0 1 auto  — shrinks to text width
 *   .sm-path-badge             flex: 1 1 auto  — fills space, right-aligned, responsive
 *   .sm-dot-badge              flex: 0 0 auto  — fixed dot, always visible
 */
export class BadgeRenderer {
	private timer: number | null = null;
	// WeakMap so GC can clean entries for detached elements automatically.
	private readonly observers = new WeakMap<HTMLElement, () => void>();

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
				const titleEl = item.selfEl ?? item.el;
				const af = this.app.vault.getAbstractFileByPath(vaultPath);
				if (!(af instanceof TFolder)) {
					this.clear(titleEl);
					continue;
				}
				const absPath = join(this.vaultRoot, af.path);
				const state = detectLink(absPath);
				if (state.kind === 'none') {
					this.clear(titleEl);
				} else {
					this.apply(
						titleEl,
						state.kind,
						state.kind === 'active' ? state.type : undefined,
						state.target
					);
				}
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

	notify(_file: TAbstractFile): void {
		this.scheduleRefresh();
	}

	// ── private ────────────────────────────────────────────────────────────────

	private apply(
		titleEl: HTMLElement,
		kind: 'active' | 'broken',
		type: 'junction' | 'symlink' | undefined,
		target: string
	): void {
		this.clear(titleEl); // removes old spans + disconnects old observer

		titleEl.addClass(kind === 'active' ? 'sm-link-active' : 'sm-link-broken');
		if (type) titleEl.addClass(`sm-link-${type}`);

		const contentEl = titleEl.querySelector('.nav-folder-title-content') as HTMLElement | null;
		const anchor = contentEl ?? titleEl;

		// ── target path span (right-aligned, responsive) ──────────────────────
		const pathSpan = document.createElement('span');
		pathSpan.className = PATH_CLS;
		const disposeObserver = applyResponsivePath(pathSpan, target);
		this.observers.set(titleEl, disposeObserver);

		// ── coloured dot span ─────────────────────────────────────────────────
		const dot = document.createElement('span');
		dot.className = `${DOT_CLS} ${DOT_CLS}-${type ?? 'broken'}`;

		// Insert order matters: pathSpan between name and dot.
		anchor.insertAdjacentElement('afterend', dot);
		anchor.insertAdjacentElement('afterend', pathSpan);
	}

	private clear(titleEl: HTMLElement): void {
		// Disconnect ResizeObserver before removing the element it's watching.
		const dispose = this.observers.get(titleEl);
		if (dispose) {
			dispose();
			this.observers.delete(titleEl);
		}
		titleEl.removeClasses([
			'sm-link-active', 'sm-link-broken', 'sm-link-junction', 'sm-link-symlink',
		]);
		titleEl.querySelectorAll(`.${DOT_CLS}, .${PATH_CLS}`).forEach((el) => el.remove());
	}
}
