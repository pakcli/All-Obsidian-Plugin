import { App, normalizePath } from 'obsidian';

/**
 * Re-indexes a vault folder (including newly linked symlinks / junctions)
 * so that all files and subdirectories immediately appear in Obsidian's
 * File Explorer tree and metadata cache without requiring a vault reload.
 */
export async function reindexVaultFolder(app: App, rawVaultPath: string): Promise<void> {
	const vaultPath = normalizePath(rawVaultPath || '');
	const adapter = app.vault.adapter as any;

	try {
		// 1. Reconcile symlink and folder creation on the adapter level
		if (typeof adapter?.reconcileSymbolicLinkCreation === 'function') {
			await adapter.reconcileSymbolicLinkCreation(vaultPath, vaultPath);
		}
		if (typeof adapter?.reconcileFolderCreation === 'function') {
			await adapter.reconcileFolderCreation(vaultPath, vaultPath);
		}

		// 2. Recursively scan the folder through adapter.list and reconcile all files/folders
		const scanAndReconcile = async (dirPath: string) => {
			if (!adapter?.list) return;
			try {
				const listed = await adapter.list(dirPath);
				if (listed) {
					// Reconcile subdirectories
					for (const folder of listed.folders || []) {
						const norm = normalizePath(folder);
						if (typeof adapter?.reconcileFolderCreation === 'function') {
							await adapter.reconcileFolderCreation(norm, norm);
						}
						await scanAndReconcile(norm);
					}
					// Reconcile files
					for (const file of listed.files || []) {
						const norm = normalizePath(file);
						if (typeof adapter?.reconcileFile === 'function') {
							await adapter.reconcileFile(norm, norm);
						}
					}
				}
			} catch {
				// ignore listing errors
			}
		};

		if (vaultPath) {
			await scanAndReconcile(vaultPath);
		} else {
			// If root, scan top-level folders
			if (adapter?.list) {
				const listed = await adapter.list('');
				for (const folder of listed.folders || []) {
					await scanAndReconcile(normalizePath(folder));
				}
			}
		}

		// 3. Notify metadataCache
		app.metadataCache.trigger('resolved');

		// 4. Force Obsidian File Explorer view to refresh & re-render tree components
		for (const leaf of app.workspace.getLeavesOfType('file-explorer')) {
			const view = leaf.view as any;
			if (view) {
				try {
					view.requestSort?.();
					view.tree?.updateComponent?.();
					view.reload?.();
				} catch {
					// ignore
				}
			}
		}
	} catch (err) {
		console.debug('[Symlink Manager] Error reindexing vault folder:', err);
	}
}
