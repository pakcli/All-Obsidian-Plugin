import { Notice } from "obsidian";
import type TreeDiagramPlugin from "../main";

export function registerCommands(plugin: TreeDiagramPlugin) {
	plugin.addCommand({
		id: 'scan-and-route-assets',
		name: 'Scan and Route All Assets in Current Note',
		callback: async () => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice('No active note to scan.');
				return;
			}
			await plugin.scanAndRouteAssetsForNote(activeFile);
		}
	});
}
