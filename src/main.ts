import { Notice, Plugin, TFolder } from 'obsidian';
import { TreeDiagramMarkdownRenderChild } from './TreeDiagramMarkdownRenderChild';
import { buildTabTree, copyToClipboard } from './util';

export default class TreeDiagramPlugin extends Plugin {

	async onload() {
		// Register tree code block processor with flag support
		this.registerMarkdownCodeBlockProcessor("tree", async (source, el, ctx) => {
			const options = { interactive: false, expandAll: false };
			ctx.addChild(new TreeDiagramMarkdownRenderChild(this, source, el, ctx, options));
		});

		// Register interactive tree variant
		this.registerMarkdownCodeBlockProcessor("tree-interactive", async (source, el, ctx) => {
			const options = { interactive: true, expandAll: false };
			ctx.addChild(new TreeDiagramMarkdownRenderChild(this, source, el, ctx, options));
		});

		// Register interactive + expandall variant
		this.registerMarkdownCodeBlockProcessor("tree-interactive-expandall", async (source, el, ctx) => {
			const options = { interactive: true, expandAll: true };
			ctx.addChild(new TreeDiagramMarkdownRenderChild(this, source, el, ctx, options));
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

