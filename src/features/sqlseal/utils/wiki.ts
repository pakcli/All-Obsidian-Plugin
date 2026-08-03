import { App, TFolder } from "obsidian";

export function resolveWikiLink(app: App, value: string, columnName: string): string {
    const cleanValue = value.trim();
    if (!cleanValue) return "";

    const files = app.vault.getMarkdownFiles();
    
    // 1. Search for existing file starting with wiki folder where basename matches cleanValue
    for (const f of files) {
        const parts = f.path.split(/[/\\]/);
        const topFolder = parts[0]?.toLowerCase() || '';
        if (topFolder.startsWith('wiki')) {
            if (f.basename.toLowerCase() === cleanValue.toLowerCase()) {
                return f.path;
            }
        }
    }

    // 2. If not found, determine the target folder under wiki/ based on columnName
    // Find folders under wiki/
    const allFiles = app.vault.getAllLoadedFiles();
    const wikiSubfolders: string[] = [];
    for (const file of allFiles) {
        if (file instanceof TFolder) {
            const parts = file.path.split(/[/\\]/);
            // Must be directly under a wiki folder, e.g. wiki/items or wiki/merchants
            if (parts.length === 2 && parts[0].toLowerCase().startsWith('wiki')) {
                wikiSubfolders.push(file.path);
            }
        }
    }

    // Try to match columnName to one of the subfolders
    const colLower = columnName.toLowerCase();
    let targetFolder = "";
    for (const folder of wikiSubfolders) {
        const folderName = folder.split(/[/\\]/)[1].toLowerCase();
        // Check if folderName matches columnName (e.g. "items" matches "item_name" or "items", "merchants" matches "merchant")
        const cleanCol = colLower.replace(/_name|_id|s$/, ''); // e.g. "item_name" -> "item", "items" -> "item", "merchants" -> "merchant"
        const cleanFolder = folderName.replace(/s$/, ''); // e.g. "items" -> "item", "merchants" -> "merchant"
        if (cleanCol.includes(cleanFolder) || cleanFolder.includes(cleanCol)) {
            targetFolder = folder;
            break;
        }
    }

    // If no specific subfolder matches, default to the first wiki subfolder, or just "wiki/"
    if (!targetFolder) {
        if (wikiSubfolders.length > 0) {
            targetFolder = wikiSubfolders[0];
        } else {
            // Find a folder starting with "wiki" at root, or default to "wiki"
            const wikiRoot = allFiles.find(f => f instanceof TFolder && f.path.toLowerCase().startsWith('wiki'));
            targetFolder = wikiRoot ? wikiRoot.path : "wiki";
        }
    }

    return `${targetFolder}/${cleanValue}`;
}
