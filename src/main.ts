import { Notice, Plugin, TFolder } from 'obsidian';
import { DiagramRenderer } from './renderers/DiagramRenderer';
import { buildTabTree } from './utils/parser';
import { copyToClipboard } from './utils/clipboard';

export default class TreeDiagramPlugin extends Plugin {
	// Store settings panel state per codeblock (keyed by source hash)
	settingsPanelStates: Map<string, boolean> = new Map();

	async onload() {
		// Register single tree code block processor
		// Configuration is now handled via inline flags
		this.registerMarkdownCodeBlockProcessor("tree", async (source, el, ctx) => {
			ctx.addChild(new DiagramRenderer(this, source, el, ctx));
		});

		// Copy full vault tree (folders + files)
		this.addCommand({
			id: "copy-vault-tree-tabs",
			name: "Copy vault tree source (folders + files)",
			callback: async () => {
				const root = this.app.vault.getRoot();
				const text = buildTabTree(root, true).join("\n");
				await copyToClipboard(text);
				new Notice("Vault tree source copied");
			},
		});

		// Copy vault folders only
		this.addCommand({
			id: "copy-vault-folders-tabs",
			name: "Copy vault tree source (folders only)",
			callback: async () => {
				const root = this.app.vault.getRoot();
				const text = buildTabTree(root, false).join("\n");
				await copyToClipboard(text);
				new Notice("Vault folders source copied");
			},
		});

		// Copy current note folder tree
		this.addCommand({
			id: "copy-current-folder-tabs",
			name: "Copy current note folder source tree",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active note");
					return;
				}
				const text = buildTabTree(file.parent as TFolder, true).join("\n");
				await copyToClipboard(text);
				new Notice("Current folder tree copied");
			},
		});
	}

	onunload() { }
}

