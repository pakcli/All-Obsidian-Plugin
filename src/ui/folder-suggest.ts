import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<string> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(inputStr: string): string[] {
		const folders = this.app.vault.getAllFolders(false);
		const folderPaths: string[] = folders.map((folder: TFolder) => folder.path);

		const inputLower = inputStr.toLowerCase();
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
