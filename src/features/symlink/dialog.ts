/**
 * Open the native OS folder picker via Electron's remote dialog.
 * Returns the chosen path, or null if the user cancelled.
 *
 * Electron is provided by Obsidian desktop. Mobile builds will not reach
 * this code because the plugin is marked isDesktopOnly.
 */
export async function browseFolder(defaultPath?: string): Promise<string | null> {
	// Electron exposes `dialog` via the @electron/remote module loaded by Obsidian.
	// We reach for it through the global require so esbuild leaves it alone.
	type DialogModule = {
		showOpenDialog: (opts: {
			title?: string;
			defaultPath?: string;
			properties: string[];
		}) => Promise<{ canceled: boolean; filePaths: string[] }>;
	};

	const req = (window as unknown as { require?: (m: string) => unknown }).require;
	if (typeof req !== 'function') return null;

	let dialog: DialogModule | null = null;
	try {
		const remote = req('@electron/remote') as { dialog?: DialogModule };
		if (remote?.dialog) dialog = remote.dialog;
	} catch {
		// fall through
	}
	if (!dialog) {
		try {
			const electron = req('electron') as { remote?: { dialog?: DialogModule } };
			if (electron?.remote?.dialog) dialog = electron.remote.dialog;
		} catch {
			// fall through
		}
	}
	if (!dialog) return null;

	const result = await dialog.showOpenDialog({
		title: 'Choose target folder',
		defaultPath,
		properties: ['openDirectory'],
	});

	if (result.canceled || result.filePaths.length === 0) return null;
	const [firstPath] = result.filePaths;
	return firstPath ?? null;
}
