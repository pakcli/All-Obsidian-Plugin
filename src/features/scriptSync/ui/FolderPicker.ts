/**
 * FolderPicker.ts
 *
 * Safe, robust folder autocomplete suggestion and modal picker for self-vault directories.
 * Supports multi-word folder names with spaces without capturing space keys.
 */
import { AbstractInputSuggest, App, FuzzySuggestModal, TFolder } from 'obsidian';

export function getAllVaultFolders(app: App): string[] {
    const folderSet = new Set<string>();
    try {
        const loaded = app.vault.getAllLoadedFiles();
        for (const file of loaded) {
            if (file instanceof TFolder) {
                if (file.path && file.path !== '/') {
                    folderSet.add(file.path);
                }
            }
        }
    } catch {
        // Ignore vault access errors
    }

    const list = Array.from(folderSet);
    list.sort();
    return list;
}

export class VaultFolderSuggest extends AbstractInputSuggest<string> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): string[] {
        const allFolders = getAllVaultFolders(this.app);
        if (!inputStr || !inputStr.trim()) {
            return allFolders;
        }

        const query = inputStr.trim().toLowerCase();
        return allFolders.filter(folder => 
            folder.toLowerCase().includes(query)
        );
    }

    renderSuggestion(folderPath: string, el: HTMLElement): void {
        el.empty();
        const container = el.createDiv({ cls: 'pakcli-folder-suggest-item' });
        container.createSpan({ cls: 'pakcli-folder-icon', text: '📁 ' });
        container.createSpan({ cls: 'pakcli-folder-name', text: folderPath });
    }

    selectSuggestion(folderPath: string): void {
        this.inputEl.value = folderPath;
        this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        this.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        this.close();
    }
}

export class FolderPickerModal extends FuzzySuggestModal<string> {
    private onChoose: (folderPath: string) => void;

    constructor(app: App, onChoose: (folderPath: string) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder('Type to search for a folder in your vault...');
    }

    getItems(): string[] {
        return getAllVaultFolders(this.app);
    }

    getItemText(item: string): string {
        return item;
    }

    onChooseItem(item: string): void {
        this.onChoose(item);
    }
}
