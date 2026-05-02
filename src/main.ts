import { Editor, MarkdownView, Menu, Notice, Plugin } from 'obsidian';
import { extractTableAtCursor, parseMarkdownTable } from './table-parser';
import { TableToFilesModal } from './table-modal';

const HISTORY_FILE = 'table-to-files-history.json';

export default class TableToFilesPlugin extends Plugin {
	private outputHistory: string[] = [];

	async onload(): Promise<void> {
		await this.loadHistory();

		this.addCommand({
			id: 'convert-table-to-files',
			name: 'Convert Table to Files',
			editorCallback: (editor, ctx) => {
				const view = ctx instanceof MarkdownView ? ctx : this.app.workspace.getActiveViewOfType(MarkdownView);
				this.openTableModal(editor, view);
			},
		});

		this.addRibbonIcon('table', 'Convert Table to Files', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			this.openTableModal(view?.editor ?? null, view);
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, ctx) => {
				const view = ctx instanceof MarkdownView ? ctx : this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view?.file) return;

				const raw = extractTableAtCursor(editor.getValue(), editor.getCursor().line);
				if (!raw) return;

				const table = parseMarkdownTable(raw);
				if (!table || table.rows.length === 0) return;

				menu.addItem((item) =>
					item
						.setTitle('Convert Table to Files')
						.setIcon('table')
						.onClick(() => this.openTableModal(editor, view))
				);
			}),
		);
	}

	openTableModal(editor: Editor | null, view: MarkdownView | null | undefined): void {
		if (!editor || !view?.file) {
			new Notice('Open a note and place the cursor inside a table first.');
			return;
		}
		const raw = extractTableAtCursor(editor.getValue(), editor.getCursor().line);
		if (!raw) {
			new Notice('Place the cursor inside a markdown table first.');
			return;
		}
		const table = parseMarkdownTable(raw);
		if (!table || table.rows.length === 0) {
			new Notice('Could not parse table, or table has no data rows.');
			return;
		}
		new TableToFilesModal(this.app, {
			table,
			defaultSubfolder: view.file.basename,
			noteFolderPath: view.file.parent?.path ?? '',
			outputHistory: this.outputHistory,
			onHistorySave: async (path: string) => {
				const idx = this.outputHistory.indexOf(path);
				if (idx > -1) this.outputHistory.splice(idx, 1);
				this.outputHistory.unshift(path);
				if (this.outputHistory.length > 10) this.outputHistory.length = 10;
				await this.saveHistory();
			},
		}).open();
	}

	private historyPath(): string {
		return `${this.app.vault.configDir}/${HISTORY_FILE}`;
	}

	async loadHistory(): Promise<void> {
		try {
			const raw = await this.app.vault.adapter.read(this.historyPath());
			const parsed = JSON.parse(raw) as unknown;
			if (Array.isArray(parsed)) {
				this.outputHistory = parsed
					.filter((v): v is string => typeof v === 'string')
					.slice(0, 10);
			}
		} catch {
			this.outputHistory = [];
		}
	}

	async saveHistory(): Promise<void> {
		await this.app.vault.adapter.write(
			this.historyPath(),
			JSON.stringify(this.outputHistory, null, 2),
		);
	}
}
