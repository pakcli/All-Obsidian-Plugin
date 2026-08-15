import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<string> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(inputStr: string): string[] {
		let folderPaths: string[] = [];
		try {
			if (typeof (this.app.vault as any).getAllFolders === 'function') {
				const folders = (this.app.vault as any).getAllFolders(false);
				folderPaths = folders.map((folder: TFolder) => folder.path);
			} else {
				const files = this.app.vault.getAllLoadedFiles();
				folderPaths = files.filter(f => f instanceof TFolder).map(f => f.path);
			}
		} catch {
			try {
				const files = this.app.vault.getAllLoadedFiles();
				folderPaths = files.filter(f => f instanceof TFolder).map(f => f.path);
			} catch {
				folderPaths = [];
			}
		}

		const inputLower = (inputStr || '').toLowerCase();
		const matchingPaths = folderPaths.filter(path =>
			path.toLowerCase().includes(inputLower)
		);

		// Sort alphabetically
		matchingPaths.sort();
		return matchingPaths;
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.createEl('span', { text: path });
	}

	selectSuggestion(path: string): void {
		this.setValue(path);
		this.close();
		// Dispatch the input event so that the onChange callback of the Setting component fires
		this.inputEl.dispatchEvent(new Event('input'));
	}
}
