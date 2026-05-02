import {
	App,
	ButtonComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
} from 'obsidian';
import type { ParsedTable, TableRow } from './table-parser';
import { normalizeKey } from './table-parser';
import { generateFiles } from './file-generator';

export interface TableModalOptions {
	table: ParsedTable;
	/** Note basename — used as default subfolder name. */
	defaultSubfolder: string;
	/** Vault-relative path of the folder containing the current note. */
	noteFolderPath: string;
	/** Recently used custom output paths (newest first, max 10). */
	outputHistory: string[];
	/** Called after a successful generate with the custom path that was used. */
	onHistorySave: (path: string) => Promise<void>;
}

export class TableToFilesModal extends Modal {
	private opts: TableModalOptions;

	private filenameColumn: string;
	private skipIfEmpty = true;
	private usePageName = true;
	private customSubfolder = '';
	private customOutputPath = '';
	private bodyTemplate = '';
	private openAfterCreate = false;

	private customOutputInput!: TextComponent;
	private previewEl!: HTMLElement;

	constructor(app: App, opts: TableModalOptions) {
		super(app);
		this.opts = opts;
		this.filenameColumn = opts.table.headers[0] ?? '';
	}

	onOpen(): void {
		this.modalEl.addClass('ttf-modal');
		this.titleEl.setText('Convert Table to Files');
		this.contentEl.empty();

		this.renderConfig();

		this.previewEl = this.contentEl.createDiv({ cls: 'ttf-preview' });
		this.refreshPreview();

		this.renderActions();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ── Config section ─────────────────────────────────────────────────────────

	private renderConfig(): void {
		const { headers } = this.opts.table;

		// Filename column
		new Setting(this.contentEl)
			.setName('Filename column')
			.setDesc('Value from this column becomes the .md filename')
			.addDropdown((d) => {
				for (const h of headers) d.addOption(h, h);
				d.setValue(this.filenameColumn);
				d.onChange((v) => {
					this.filenameColumn = v;
					this.refreshPreview();
				});
			});

		// Skip empty / "?"
		new Setting(this.contentEl)
			.setName('Skip rows where filename is empty or "?"')
			.addToggle((t) =>
				t.setValue(this.skipIfEmpty).onChange((v) => {
					this.skipIfEmpty = v;
					this.refreshPreview();
				}),
			);

		// Subfolder toggle + custom input
		let customInput!: TextComponent;

		new Setting(this.contentEl)
			.setName('Subfolder = note name')
			.setDesc(`Current: "${this.opts.defaultSubfolder}"`)
			.addToggle((t) =>
				t.setValue(this.usePageName).onChange((v) => {
					this.usePageName = v;
					customInput.setDisabled(v);
					this.refreshPreview();
				}),
			);

		new Setting(this.contentEl)
			.setName('Custom subfolder name')
			.setDesc('Used when toggle above is off')
			.addText((t) => {
				customInput = t;
				t.setPlaceholder('example01');
				t.setDisabled(this.usePageName);
				t.onChange((v) => {
					this.customSubfolder = v;
					this.refreshPreview();
				});
			});

		// Custom output directory
		new Setting(this.contentEl)
			.setName('Custom output directory')
			.setDesc('Vault path (e.g. Notes/Quran). Overrides note folder + subfolder above when set.')
			.addText((t) => {
				this.customOutputInput = t;
				t.setPlaceholder('e.g. Notes/Quran-Tracker');
				t.onChange((v) => {
					this.customOutputPath = v;
					this.refreshPreview();
				});
			});

		this.renderHistoryList();

		// Body template
		new Setting(this.contentEl)
			.setName('Body template')
			.setDesc('Text inserted below frontmatter (leave blank for frontmatter only)')
			.addText((t) =>
				t
					.setPlaceholder('Optional body text…')
					.onChange((v) => {
						this.bodyTemplate = v;
					}),
			);

		// Open first file after generate
		new Setting(this.contentEl)
			.setName('Open first file after generate')
			.addToggle((t) =>
				t.setValue(this.openAfterCreate).onChange((v) => {
					this.openAfterCreate = v;
				}),
			);
	}

	// ── History list ───────────────────────────────────────────────────────────

	private renderHistoryList(): void {
		const history = this.opts.outputHistory;
		if (history.length === 0) return;

		const wrap = this.contentEl.createDiv({ cls: 'ttf-history-wrap' });

		const header = wrap.createDiv({ cls: 'ttf-history-header' });
		header.createSpan({ cls: 'ttf-history-label', text: 'Recent paths' });

		const clearBtn = header.createSpan({ cls: 'ttf-history-clear', text: 'Clear' });
		clearBtn.addEventListener('click', () => {
			this.opts.outputHistory.length = 0;
			wrap.remove();
		});

		const list = wrap.createDiv({ cls: 'ttf-history-list' });

		for (const path of history) {
			const item = list.createDiv({ cls: 'ttf-history-item' });
			item.setText(path);
			item.addEventListener('click', () => {
				this.customOutputInput.setValue(path);
				this.customOutputPath = path;
				this.refreshPreview();
				list.querySelectorAll('.ttf-history-item').forEach((el) =>
					el.removeClass('ttf-history-item-active'),
				);
				item.addClass('ttf-history-item-active');
			});
		}
	}

	// ── Preview ────────────────────────────────────────────────────────────────

	private resolvedSubfolder(): string {
		if (this.usePageName) return this.opts.defaultSubfolder;
		return this.customSubfolder.trim() || this.opts.defaultSubfolder;
	}

	/** The folder path that will actually be used for output (for preview display). */
	private resolvedOutputFolder(): string {
		if (this.customOutputPath.trim()) return this.customOutputPath.trim();
		const base = this.opts.noteFolderPath;
		const sub = this.resolvedSubfolder();
		return base ? `${base}/${sub}` : sub;
	}

	private filteredRows(): TableRow[] {
		return this.opts.table.rows.filter((row) => {
			const name = row[this.filenameColumn]?.trim() ?? '';
			if (!name) return false;
			if (this.skipIfEmpty && name === '?') return false;
			return true;
		});
	}

	private refreshPreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();

		const rows = this.filteredRows();
		const outputFolder = this.resolvedOutputFolder();
		const skipped = this.opts.table.rows.length - rows.length;

		this.previewEl.createEl('h4', {
			cls: 'ttf-preview-title',
			text: 'Preview',
		});

		const summary = this.previewEl.createDiv({ cls: 'ttf-preview-summary' });
		summary.setText(
			`${rows.length} file(s) will be created in "${outputFolder}/"` +
				(skipped > 0 ? ` · ${skipped} row(s) skipped` : ''),
		);

		if (rows.length === 0) return;

		const sample = rows[0];
		if (!sample) return;

		const filename = sample[this.filenameColumn] ?? '(unknown)';
		const sampleEl = this.previewEl.createDiv({ cls: 'ttf-preview-sample' });
		sampleEl.createDiv({
			cls: 'ttf-sample-filename',
			text: `${outputFolder}/${filename}.md`,
		});

		const fmLines = ['---'];
		for (const [header, value] of Object.entries(sample)) {
			const key = normalizeKey(header);
			if (key) fmLines.push(`${key}: ${value}`);
		}
		fmLines.push('---');

		sampleEl.createEl('pre', {
			cls: 'ttf-sample-code',
			text: fmLines.join('\n'),
		});
	}

	// ── Actions ────────────────────────────────────────────────────────────────

	private renderActions(): void {
		const actions = this.contentEl.createDiv({ cls: 'ttf-actions' });

		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());

		new ButtonComponent(actions)
			.setButtonText('Generate Files')
			.setCta()
			.onClick(() => void this.generate());
	}

	private async generate(): Promise<void> {
		const rows = this.filteredRows();
		if (rows.length === 0) {
			new Notice('No rows to generate — check your column and skip settings.');
			return;
		}

		try {
			const result = await generateFiles(
				this.app,
				{
					rows,
					filenameColumn: this.filenameColumn,
					subfolder: this.resolvedSubfolder(),
					customOutputPath: this.customOutputPath,
					bodyTemplate: this.bodyTemplate,
					openAfterCreate: this.openAfterCreate,
				},
				this.opts.noteFolderPath,
			);

			if (this.customOutputPath.trim()) {
				await this.opts.onHistorySave(this.customOutputPath.trim());
			}

			const msg =
				`Generated ${result.created.length} file(s)` +
				(result.skipped > 0 ? `, skipped ${result.skipped}.` : '.');
			new Notice(msg);
			this.close();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Table to Files: ${msg}`, 8000);
		}
	}
}
