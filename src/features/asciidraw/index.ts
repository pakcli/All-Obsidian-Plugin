import { MarkdownView, Notice, Plugin } from 'obsidian';
import { AsciiCodeblockRenderer } from './ui/AsciiCodeblockRenderer';
import { AsciiDrawModal } from './ui/AsciiDrawModal';

export function registerAsciiDrawFeature(plugin: Plugin): void {
	// 1. Register Codeblock Processors
	const asciiLangs = ['asciidraw', 'ascii-draw', 'ascii-canvas'];

	asciiLangs.forEach(lang => {
		try {
			plugin.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
				const renderer = new AsciiCodeblockRenderer(el, source, lang, ctx, plugin.app);
				ctx.addChild(renderer);
			});
		} catch (err) {
			console.warn(`[ASCII Draw] Failed to register codeblock processor for "${lang}":`, err);
		}
	});

	// 2. Add Ribbon Icon
	plugin.addRibbonIcon('pencil', 'ASCII Studio: New Drawing Canvas', () => {
		openAsciiStudioModal(plugin, false);
	});

	// 3. Add Commands
	plugin.addCommand({
		id: 'asciidraw-insert-new-canvas',
		name: 'ASCII Studio: Insert New Drawing Canvas at Cursor',
		callback: () => {
			insertNewAsciiBlock(plugin);
		}
	});

	plugin.addCommand({
		id: 'asciidraw-open-fullscreen-studio',
		name: 'ASCII Studio: Open Fullscreen Drawing Studio',
		callback: () => {
			openAsciiStudioModal(plugin, true);
		}
	});
}

function openAsciiStudioModal(plugin: Plugin, startFullscreen = false): void {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	const initialTemplate = `┌──────────────────────────┐\n│  ASCII Drawing Canvas    │\n└──────────────────────────┘`;

	const modal = new AsciiDrawModal(plugin.app, {
		initialContent: initialTemplate,
		onSave: async (savedContent) => {
			if (activeView && activeView.editor) {
				const editor = activeView.editor;
				const block = `\`\`\`asciidraw\n${savedContent}\n\`\`\`\n`;
				editor.replaceRange(block, editor.getCursor());
				new Notice('Inserted ASCII drawing at cursor.');
			}
		}
	});

	modal.open();

	if (startFullscreen) {
		setTimeout(() => {
			modal.modalEl.addClass('is-fullscreen-immersive');
		}, 50);
	}
}

function insertNewAsciiBlock(plugin: Plugin): void {
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView || !activeView.editor) {
		new Notice('Please open a markdown note to insert ASCII canvas.');
		return;
	}

	const initialContent = `┌──────────────────────────┐\n│  ASCII Drawing Canvas    │\n└──────────────────────────┘`;

	const modal = new AsciiDrawModal(plugin.app, {
		initialContent,
		onSave: (savedContent) => {
			const editor = activeView.editor;
			const block = `\`\`\`asciidraw\n${savedContent}\n\`\`\`\n`;
			editor.replaceRange(block, editor.getCursor());
			new Notice('✓ Inserted ASCII drawing codeblock!');
		}
	});

	modal.open();
}
