import { App, AbstractInputSuggest, TFolder } from "obsidian";

/**
 * A generic suggest class that autocompletes text inputs with a string array.
 */
export class GenericTextSuggest extends AbstractInputSuggest<string> {
    private items: string[];
    inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement, items: string[]) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.items = items;
    }

    public setItems(items: string[]) {
        this.items = items;
    }

    protected getSuggestions(query: string): string[] {
        const lower = query.toLowerCase();
        return this.items.filter(item => item.toLowerCase().includes(lower));
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string): void {
        this.setValue(value);
        this.inputEl.dispatchEvent(new Event('change'));
        this.inputEl.dispatchEvent(new Event('input'));
        this.close();
    }
}

/**
 * Autocompletes folders inside the vault.
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    protected getSuggestions(query: string): string[] {
        const lower = query.toLowerCase();
        const folders = this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder && f.path !== "/");
        return folders
            .map(f => f.path)
            .filter(path => path.toLowerCase().includes(lower));
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string): void {
        this.setValue(value);
        this.inputEl.dispatchEvent(new Event('change'));
        this.inputEl.dispatchEvent(new Event('input'));
        this.close();
    }
}

/**
 * Autocompletes CSV/TSV files inside the vault.
 */
export class CsvFileSuggest extends AbstractInputSuggest<string> {
    inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    protected getSuggestions(query: string): string[] {
        const lower = query.toLowerCase();
        const files = this.app.vault.getFiles()
            .filter(f => f.extension.toLowerCase() === "csv" || f.extension.toLowerCase() === "tsv");
        return files
            .map(f => f.path)
            .filter(path => path.toLowerCase().includes(lower));
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string): void {
        this.setValue(value);
        this.inputEl.dispatchEvent(new Event('change'));
        this.inputEl.dispatchEvent(new Event('input'));
        this.close();
    }
}
