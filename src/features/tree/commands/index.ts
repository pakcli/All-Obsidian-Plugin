import { Notice, TFolder } from "obsidian";
import type PakCLIPlugin from "../../../main";
import { buildTabTree } from "../utils/parser";
import { copyToClipboard } from "../utils/clipboard";

export function registerCommands(plugin: PakCLIPlugin) {
	plugin.addCommand({
		id: 'scan-and-route-assets',
		name: 'Scan and Route All Assets in Current Note',
		callback: async () => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice('No active note to scan.');
				return;
			}
			await plugin.router.scanAndRouteAssetsForNote(activeFile);
		}
	});

	plugin.addCommand({
		id: 'rescan-centralized-assets',
		name: 'Rescan Centralized Assets',
		callback: async () => {
			await plugin.router.rescanCentralizedAssets();
		}
	});

	plugin.addCommand({
		id: 'rescan-nested-captain-assets',
		name: 'Rescan All Captain Folder (Nested) Assets',
		callback: async () => {
			await plugin.router.rescanAllNestedAssets();
		}
	});

	plugin.addCommand({
		id: "copy-vault-tree-tabs",
		name: "Copy vault tree source (folders + files)",
		callback: async () => {
			const root = plugin.app.vault.getRoot();
			const text = buildTabTree(root, true).join("\n");
			await copyToClipboard(text);
			new Notice("Vault tree source copied");
		},
	});

	plugin.addCommand({
		id: "copy-vault-folders-tabs",
		name: "Copy vault tree source (folders only)",
		callback: async () => {
			const root = plugin.app.vault.getRoot();
			const text = buildTabTree(root, false).join("\n");
			await copyToClipboard(text);
			new Notice("Vault folders source copied");
		},
	});

	plugin.addCommand({
		id: "copy-current-folder-tabs",
		name: "Copy current note folder source tree",
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				new Notice("No active note");
				return;
			}
			if (file.parent instanceof TFolder) {
				const text = buildTabTree(file.parent, true).join("\n");
				await copyToClipboard(text);
				new Notice("Current folder tree copied");
			}
		},
	});
}
