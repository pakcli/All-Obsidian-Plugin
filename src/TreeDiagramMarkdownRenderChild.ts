import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { parseWithConfig, treeView, copyToClipboard, enableWikiLinks, TreeConfig } from './util';
import TreeDiagramPlugin from "./main";
import TreeNode from './node';
import { TableModeA } from './TableModeA';
import { TableModeB } from './TableModeB';

export type ViewMode = 'tree' | 'table-a' | 'table-b';

export class TreeDiagramMarkdownRenderChild extends MarkdownRenderChild {
	plugin: TreeDiagramPlugin;
	source: string;
	ctx: MarkdownPostProcessorContext;
	config: TreeConfig;
	trees: TreeNode[];
	expandedNodes: Set<string>;
	treeVisible: boolean; // Track if tree content is visible (for collapsible title)
	viewMode: ViewMode = 'tree'; // Current view mode
	tableBNavigationStack: string[] = []; // Navigation stack for Table Mode B
	levelNumberOffset: number = 0; // Offset for level numbering (0 = root is 1, 1 = root has no number)
	isUpdatingSource: boolean = false; // Flag to prevent re-render during source update
	sourceHash: string; // Unique identifier for this codeblock

	constructor(
		plugin: TreeDiagramPlugin,
		source: string,
		containerEl: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.ctx = ctx;
		this.expandedNodes = new Set<string>();
		
		// Parse configuration and trees
		const parseResult = parseWithConfig(source);
		this.config = parseResult.config;
		this.trees = parseResult.trees;
		
		// Create a hash from tree content only (without flags) to identify this codeblock
		// This ensures the hash stays the same even when flags change
		const sourceLines = source.split('\n');
		const treeContentLines: string[] = [];
		for (const line of sourceLines) {
			const trimmed = line.trim();
			// Skip flag lines
			if (trimmed.startsWith('-') && trimmed.includes(':')) {
				continue;
			}
			// Skip empty lines at start
			if (treeContentLines.length === 0 && trimmed === '') {
				continue;
			}
			treeContentLines.push(line);
		}
		const treeContent = treeContentLines.join('\n').trim();
		this.sourceHash = this.hashCode(treeContent);
		
		console.log(`[Constructor] Created instance with hash=${this.sourceHash}`);
		console.log(`[Constructor] Tree content length=${treeContent.length}`);
		console.log(`[Constructor] Current panel state=${this.settingsPanelOpen}`);
		
		// Initialize from config
		this.levelNumberOffset = this.config.offsetLevelNumbered;
		
		// Map currentView to viewMode
		if (this.config.currentView === 2) {
			this.viewMode = 'table-a';
		} else if (this.config.currentView === 3) {
			this.viewMode = 'table-b';
		} else {
			this.viewMode = 'tree';
		}
		
		// Initialize tree visibility based on startShowLevel
		// If startShowLevel is 0, tree starts collapsed (hidden)
		// Otherwise, tree is always visible
		this.treeVisible = this.config.startShowLevel !== 0;
	}

	/**
	 * Simple hash function to create unique ID from source
	 */
	private hashCode(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString();
	}

	/**
	 * Get settings panel open state from plugin storage
	 */
	private get settingsPanelOpen(): boolean {
		const isOpen = this.plugin.settingsPanelStates.get(this.sourceHash) || false;
		console.log(`[settingsPanelOpen getter] hash=${this.sourceHash}, isOpen=${isOpen}`);
		return isOpen;
	}

	/**
	 * Set settings panel open state in plugin storage
	 */
	private set settingsPanelOpen(value: boolean) {
		console.log(`[settingsPanelOpen setter] hash=${this.sourceHash}, value=${value}`);
		this.plugin.settingsPanelStates.set(this.sourceHash, value);
	}

	/**
	 * Update the source codeblock with current config flags
	 */
	private async updateSourceCodeblock() {
		console.log('=== updateSourceCodeblock called ===');
		console.log('Source path:', this.ctx.sourcePath);
		
		// Set flag to indicate we're updating
		this.isUpdatingSource = true;
		
		try {
			// Get the active file from the workspace
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (!activeFile) {
				console.log('No active file');
				this.isUpdatingSource = false;
				return;
			}
			
			console.log('Active file:', activeFile.path);
			
			// Read the file content
			const content = await this.plugin.app.vault.read(activeFile);
			const lines = content.split('\n');
			
			console.log('Total lines:', lines.length);
			
			// Extract tree content from this.source (without flags) for matching
			const sourceLines = this.source.split('\n');
			const sourceTreeContent: string[] = [];
			for (const line of sourceLines) {
				const trimmed = line.trim();
				// Skip flag lines and empty lines at start
				if (trimmed.startsWith('-') && trimmed.includes(':')) {
					continue;
				}
				if (sourceTreeContent.length === 0 && trimmed === '') {
					continue;
				}
				sourceTreeContent.push(line);
			}
			const sourceTreeText = sourceTreeContent.join('\n').trim();
			
			console.log('Source tree content length:', sourceTreeText.length);
			
			// Find all tree codeblocks and match with our source
			let codeblockStart = -1;
			let codeblockEnd = -1;
			let currentBlockStart = -1;
			let inCodeblock = false;
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				
				if (line.startsWith('```tree')) {
					if (!inCodeblock) {
						currentBlockStart = i;
						inCodeblock = true;
					}
				} else if (line === '```' && inCodeblock) {
					// Found end of a codeblock, check if it matches our source
					const blockLines = lines.slice(currentBlockStart + 1, i);
					const blockTreeContent: string[] = [];
					
					for (const blockLine of blockLines) {
						const trimmed = blockLine.trim();
						// Skip flag lines and empty lines at start
						if (trimmed.startsWith('-') && trimmed.includes(':')) {
							continue;
						}
						if (blockTreeContent.length === 0 && trimmed === '') {
							continue;
						}
						blockTreeContent.push(blockLine);
					}
					
					const blockTreeText = blockTreeContent.join('\n').trim();
					
					// Check if this block matches our source
					if (blockTreeText === sourceTreeText) {
						codeblockStart = currentBlockStart;
						codeblockEnd = i;
						console.log('Found matching codeblock at lines:', codeblockStart, '-', codeblockEnd);
						break;
					}
					
					inCodeblock = false;
				}
			}
			
			if (codeblockStart === -1 || codeblockEnd === -1) {
				console.log('Could not find matching codeblock');
				this.isUpdatingSource = false;
				return;
			}
			
			// Extract current codeblock content
			const codeblockLines = lines.slice(codeblockStart, codeblockEnd + 1);
			console.log('Codeblock lines:', codeblockLines.length);
			
			// Find where tree content starts (after existing flags)
			const treeContentLines: string[] = [];
			
			for (let i = 1; i < codeblockLines.length - 1; i++) {
				const line = codeblockLines[i];
				const trimmed = line.trim();
				
				// Skip existing flag lines
				if (trimmed.startsWith('-') && trimmed.includes(':')) {
					console.log('Skipping flag line:', trimmed);
					continue;
				}
				
				// Skip empty lines at the beginning
				if (treeContentLines.length === 0 && trimmed === '') {
					continue;
				}
				
				// This is tree content
				treeContentLines.push(line);
			}
			
			console.log('Tree content lines:', treeContentLines.length);
			
			// Build new flags (each on its own line)
			const newFlags = [
				'-interactive:' + this.config.interactive,
				'-startshowlevel:' + this.config.startShowLevel,
				'-levelnumbered:' + this.config.levelNumbered,
				'-offsetlevelnumbered:' + this.levelNumberOffset,
				'-currentview:' + this.config.currentView
			];
			
			console.log('New flags:', newFlags);
			
			// Reconstruct codeblock with flags at the top
			const newCodeblock = [
				codeblockLines[0], // ```tree
				...newFlags,
				'', // Empty line after flags
				...treeContentLines,
				codeblockLines[codeblockLines.length - 1] // ```
			];
			
			// Replace in full content
			const newLines = [
				...lines.slice(0, codeblockStart),
				...newCodeblock,
				...lines.slice(codeblockEnd + 1)
			];
			
			const newContent = newLines.join('\n');
			
			console.log('About to modify file...');
			await this.plugin.app.vault.modify(activeFile, newContent);
			
			console.log('✅ Codeblock updated successfully!');
			
			// Wait a bit before resetting flag to allow Obsidian to process the change
			setTimeout(() => {
				this.isUpdatingSource = false;
			}, 100);
		} catch (error) {
			console.error('❌ Failed to update codeblock:', error);
			this.isUpdatingSource = false;
		}
	}

	async onload() {
		// Initialize expanded nodes based on startShowLevel value (only for interactive mode)
		// startShowLevel controls initial visible depth - auto-expand nodes to that level
		if (this.config.interactive && this.config.startShowLevel > 1) {
			this.initializeExpandedNodes(this.config.startShowLevel);
		}
		
		// Ensure tree is visible if startShowLevel > 0
		if (this.config.startShowLevel > 0) {
			this.treeVisible = true;
		}
		
		this.render();
	}

	render() {
		// Clear container
		this.containerEl.empty();

		const wrapper = this.containerEl.createDiv();
		wrapper.style.position = "relative";
		wrapper.addClass('tree-diagram-container');

		// Create main layout with content and settings panel
		const mainLayout = wrapper.createDiv({ cls: 'tree-main-layout' });
		
		// Content area (left side)
		const contentArea = mainLayout.createDiv({ cls: 'tree-content-area' });
		
		// Add top control bar
		this.renderTopControlBar(contentArea);

		// Render based on view mode
		if (this.viewMode === 'tree') {
			this.renderTreeView(contentArea);
		} else if (this.viewMode === 'table-a') {
			this.renderTableModeA(contentArea);
		} else if (this.viewMode === 'table-b') {
			this.renderTableModeB(contentArea);
		}
		
		// Settings panel (right side) - always render to preserve state
		this.renderSettingsPanel(mainLayout);
	}

	renderTreeView(contentArea: HTMLElement) {
		const pre = contentArea.createEl("pre");
		Object.assign(pre.style, {
			margin: "0",
			whiteSpace: "pre",
			fontFamily: "var(--font-monospace)",
		});

		const allLines: string[] = [];

		// Determine title to display
		let displayTitle = this.config.title;
		
		// If no title and startShowLevel is 0, generate auto-title from root names
		if (!displayTitle && this.config.startShowLevel === 0) {
			const rootNames = this.trees.map(tree => tree.name);
			displayTitle = rootNames.join(", ");
		}

		// Add title if we have one
		if (displayTitle) {
			if (this.config.startShowLevel === 0) {
				// Collapsible mode
				const link = this.treeVisible ? "(less)" : "(more)";
				allLines.push(`${displayTitle} {{TITLE_TOGGLE:${link}}}`);
			} else {
				// Always visible mode
				allLines.push(displayTitle);
			}
		}

		// Render tree content if visible
		if (this.treeVisible) {
			this.trees.forEach((tree, treeIndex) => {
				const treeLines = treeView(
					tree,
					this.config.interactive,
					this.expandedNodes,
					`tree${treeIndex}`,
					this.config.levelNumbered,
					`${treeIndex + 1}`, // Root number
					this.config.startShowLevel, // Pass startShowLevel to control visible depth
					this.levelNumberOffset // Pass level number offset
				);
				allLines.push(...treeLines);
				
				// Add spacing between trees
				if (treeIndex < this.trees.length - 1) {
					allLines.push("");
				}
			});
		}

		const fullText = allLines.join("\n");
		
		// Store plain text version for copying (with toggles replaced)
		const plainTextForCopy = fullText
			.replace(/\{\{TITLE_TOGGLE:(.*?)\}\}/g, '$1')
			.replace(/\{\{TOGGLE:(.*?):(.*?)\}\}/g, '$2');

		// Escape HTML first to preserve ASCII characters
		const escapeHtml = (text: string) => {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		};

		// Escape HTML
		let htmlContent = escapeHtml(fullText);
		
		// Replace title toggle placeholders
		htmlContent = htmlContent.replace(/\{\{TITLE_TOGGLE:(.*?)\}\}/g, 
			'<span class="title-toggle">$1</span>');
		
		// Replace node toggle placeholders
		htmlContent = htmlContent.replace(/\{\{TOGGLE:(.*?):(.*?)\}\}/g, 
			'<span class="tree-toggle" data-path="$1">$2</span>');
		
		// Replace wikilinks (supports mixed text and wikilinks)
		htmlContent = htmlContent.replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (_, target, alias) => {
			const display = alias ? alias : target;
			return `<a class="internal-link" data-href="${target.trim()}">${display.trim()}</a>`;
		});

		pre.innerHTML = htmlContent;

		enableWikiLinks(pre, this.plugin.app, this.ctx.sourcePath);

		// Add click handler for title toggle (if collapsible mode)
		if (this.config.startShowLevel === 0 && (this.config.title || this.trees.length > 0)) {
			pre.querySelectorAll(".title-toggle").forEach((toggle) => {
				const span = toggle as HTMLSpanElement;
				
				span.onclick = (e: MouseEvent) => {
					// Allow text selection - only toggle if not selecting text
					const selection = window.getSelection();
					if (selection && selection.toString().length > 0) {
						// User is selecting text, don't toggle
						return;
					}
					
					e.preventDefault();
					e.stopPropagation();
					this.toggleTreeVisibility();
				};
			});
		}

		// Add click handlers for node toggles
		if (this.config.interactive) {
			pre.querySelectorAll(".tree-toggle").forEach((toggle) => {
				const span = toggle as HTMLSpanElement;
				
				span.onclick = (e: MouseEvent) => {
					// Allow text selection - only toggle if not selecting text
					const selection = window.getSelection();
					if (selection && selection.toString().length > 0) {
						// User is selecting text, don't toggle
						return;
					}
					
					e.preventDefault();
					e.stopPropagation();
					const path = span.dataset.path;
					if (path) {
						this.toggleNode(path);
					}
				};
			});
		}
	}

	renderTableModeA(wrapper: HTMLElement) {
		const container = wrapper.createDiv({ cls: 'tree-table-container' });
		const renderer = new TableModeA(this.trees);
		const table = renderer.render();
		container.appendChild(table);
		
		// Enable wikilinks in table after DOM is ready
		// Use setTimeout to ensure DOM is fully rendered
		setTimeout(() => {
			console.log('[TableModeA] Enabling wikilinks...');
			const links = table.querySelectorAll('a.internal-link');
			console.log(`[TableModeA] Found ${links.length} internal links`);
			enableWikiLinks(table, this.plugin.app, this.ctx.sourcePath);
		}, 0);
	}

	renderTableModeB(wrapper: HTMLElement) {
		// Render breadcrumb in top bar if navigation stack is not empty
		if (this.tableBNavigationStack.length > 0) {
			const topBar = wrapper.querySelector('.tree-top-control-bar');
			if (topBar) {
				const breadcrumb = document.createElement('div');
				breadcrumb.className = 'table-breadcrumb-inline';
				
				// Add "Root" link
				const rootLink = document.createElement('span');
				rootLink.className = 'breadcrumb-link';
				rootLink.textContent = 'Root';
				rootLink.onclick = () => {
					this.tableBNavigationStack = [];
					this.render();
				};
				breadcrumb.appendChild(rootLink);
				
				// Add navigation path
				this.tableBNavigationStack.forEach((item, index) => {
					const separator = document.createElement('span');
					separator.className = 'breadcrumb-separator';
					separator.textContent = ' > ';
					breadcrumb.appendChild(separator);
					
					const link = document.createElement('span');
					link.className = 'breadcrumb-link';
					link.textContent = item;
					link.onclick = () => {
						this.tableBNavigationStack = this.tableBNavigationStack.slice(0, index + 1);
						this.render();
					};
					breadcrumb.appendChild(link);
				});
				
				// Insert breadcrumb at the beginning of top bar
				topBar.insertBefore(breadcrumb, topBar.firstChild);
			}
		}
		
		const container = wrapper.createDiv({ cls: 'tree-table-container' });
		const renderer = new TableModeB(
			this.trees, 
			this.tableBNavigationStack,
			(newStack) => {
				this.tableBNavigationStack = newStack;
				this.render();
			}
		);
		const tableContainer = renderer.render();
		container.appendChild(tableContainer);
		
		// Enable wikilinks in table after DOM is ready
		// Use setTimeout to ensure DOM is fully rendered
		setTimeout(() => {
			console.log('[TableModeB] Enabling wikilinks...');
			const links = tableContainer.querySelectorAll('a.internal-link');
			console.log(`[TableModeB] Found ${links.length} internal links`);
			enableWikiLinks(tableContainer, this.plugin.app, this.ctx.sourcePath);
		}, 0);
	}

	renderTopControlBar(contentArea: HTMLElement) {
		const topBar = contentArea.createDiv({ cls: 'tree-top-control-bar' });
		
		// Interactive toggle button
		const interactiveBtn = topBar.createEl("button", {
			text: this.config.interactive ? "(v) interactive" : "(>) interactive",
			cls: 'tree-control-button'
		});
		interactiveBtn.onclick = async () => {
			this.config.interactive = !this.config.interactive;
			await this.updateSourceCodeblock();
			this.render();
		};
		
		// Copy button
		const copyBtn = topBar.createEl("button", { 
			text: "copy",
			cls: 'tree-control-button'
		});
		copyBtn.onclick = async () => {
			const plainText = this.getPlainTextForCopy();
			const ok = await copyToClipboard(plainText);
			copyBtn.textContent = ok ? "Copied!" : "Fail";
			setTimeout(() => (copyBtn.textContent = "copy"), 1200);
		};
		
		// Settings toggle button (three dots)
		const settingsBtn = topBar.createEl("button", {
			text: "⋯",
			cls: 'tree-control-button tree-settings-toggle'
		});
		settingsBtn.onclick = () => {
			this.settingsPanelOpen = !this.settingsPanelOpen;
			this.render();
		};
	}

	renderSettingsPanel(mainLayout: HTMLElement) {
		const settingsPanel = mainLayout.createDiv({ 
			cls: this.settingsPanelOpen ? 'tree-settings-panel open' : 'tree-settings-panel'
		});
		
		if (!this.settingsPanelOpen) {
			return;
		}
		
		// Settings header
		const header = settingsPanel.createDiv({ cls: 'settings-header' });
		header.createEl("h3", { text: "settings" });
		
		// View mode dropdown
		const viewModeGroup = settingsPanel.createDiv({ cls: 'settings-group' });
		viewModeGroup.createEl("label", { text: "view mode", cls: 'settings-label' });
		const viewModeSelect = viewModeGroup.createEl("select", {
			cls: 'settings-select'
		});
		viewModeSelect.createEl("option", { value: 'tree', text: 'Tree' });
		viewModeSelect.createEl("option", { value: 'table-a', text: 'Table FullView' });
		viewModeSelect.createEl("option", { value: 'table-b', text: 'Table FolderView' });
		viewModeSelect.value = this.viewMode;
		viewModeSelect.onchange = async () => {
			this.viewMode = viewModeSelect.value as ViewMode;
			// Update config
			if (this.viewMode === 'tree') {
				this.config.currentView = 1;
			} else if (this.viewMode === 'table-a') {
				this.config.currentView = 2;
			} else if (this.viewMode === 'table-b') {
				this.config.currentView = 3;
			}
			await this.updateSourceCodeblock();
			this.render();
		};
		
		// Interactive toggle
		const interactiveGroup = settingsPanel.createDiv({ cls: 'settings-group' });
		interactiveGroup.createEl("label", { text: "interactive", cls: 'settings-label' });
		const interactiveToggle = interactiveGroup.createDiv({ cls: 'settings-toggle' });
		const onBtn = interactiveToggle.createEl("button", {
			text: "● ON",
			cls: this.config.interactive ? 'toggle-btn active' : 'toggle-btn'
		});
		onBtn.onclick = async () => {
			this.config.interactive = true;
			await this.updateSourceCodeblock();
			this.render();
		};
		
		const offBtn = interactiveToggle.createEl("button", {
			text: "○ OFF",
			cls: !this.config.interactive ? 'toggle-btn active' : 'toggle-btn'
		});
		offBtn.onclick = async () => {
			this.config.interactive = false;
			await this.updateSourceCodeblock();
			this.render();
		};
		
		// Start show level spinner
		const showLevelGroup = settingsPanel.createDiv({ cls: 'settings-group' });
		showLevelGroup.createEl("label", { text: "start show level", cls: 'settings-label' });
		const showLevelSpinner = this.createSpinner(
			"",
			this.config.startShowLevel,
			0,
			10,
			async (value) => {
				this.config.startShowLevel = value;
				this.treeVisible = value > 0;
				// Re-initialize expanded nodes if needed
				if (this.config.interactive && value > 1) {
					this.expandedNodes.clear();
					this.initializeExpandedNodes(value);
				}
				await this.updateSourceCodeblock();
				this.render();
			}
		);
		showLevelGroup.appendChild(showLevelSpinner);
		
		// Level numbered spinner
		const numberingGroup = settingsPanel.createDiv({ cls: 'settings-group' });
		numberingGroup.createEl("label", { text: "level numbered", cls: 'settings-label' });
		const numberingSpinner = this.createSpinner(
			"",
			this.config.levelNumbered,
			0,
			10,
			async (value) => {
				this.config.levelNumbered = value;
				await this.updateSourceCodeblock();
				this.render();
			}
		);
		numberingGroup.appendChild(numberingSpinner);
		
		// Level number offset spinner
		const offsetGroup = settingsPanel.createDiv({ cls: 'settings-group' });
		offsetGroup.createEl("label", { text: "offset", cls: 'settings-label' });
		const offsetSpinner = this.createSpinner(
			"",
			this.levelNumberOffset,
			0,
			10,
			async (value) => {
				this.levelNumberOffset = value;
				this.config.offsetLevelNumbered = value;
				await this.updateSourceCodeblock();
				this.render();
			}
		);
		offsetGroup.appendChild(offsetSpinner);
	}

	createSpinner(label: string, value: number, min: number, max: number, onChange: (value: number) => void | Promise<void>): HTMLElement {
		const spinner = document.createElement('div');
		spinner.className = 'tree-spinner';
		
		if (label) {
			const labelEl = document.createElement('span');
			labelEl.textContent = label + ":";
			labelEl.style.marginRight = "4px";
			labelEl.style.fontSize = "11px";
			spinner.appendChild(labelEl);
		}
		
		// Decrease button
		const decreaseBtn = document.createElement('button');
		decreaseBtn.textContent = "−";
		decreaseBtn.className = 'spinner-button';
		decreaseBtn.onclick = () => {
			if (value > min) {
				onChange(value - 1);
			}
		};
		spinner.appendChild(decreaseBtn);
		
		// Value display
		const valueEl = document.createElement('span');
		valueEl.textContent = value.toString();
		valueEl.className = 'spinner-value';
		spinner.appendChild(valueEl);
		
		// Increase button
		const increaseBtn = document.createElement('button');
		increaseBtn.textContent = "+";
		increaseBtn.className = 'spinner-button';
		increaseBtn.onclick = () => {
			if (value < max) {
				onChange(value + 1);
			}
		};
		spinner.appendChild(increaseBtn);
		
		return spinner;
	}

	getPlainTextForCopy(): string {
		const allLines: string[] = [];
		
		// Add title if present
		let displayTitle = this.config.title;
		if (!displayTitle && this.config.startShowLevel === 0) {
			const rootNames = this.trees.map(tree => tree.name);
			displayTitle = rootNames.join(", ");
		}
		
		if (displayTitle) {
			if (this.config.startShowLevel === 0) {
				const link = this.treeVisible ? "(less)" : "(more)";
				allLines.push(`${displayTitle} ${link}`);
			} else {
				allLines.push(displayTitle);
			}
		}
		
		// Add tree content if visible
		if (this.treeVisible) {
			this.trees.forEach((tree, treeIndex) => {
				const treeLines = treeView(
					tree,
					this.config.interactive,
					this.expandedNodes,
					`tree${treeIndex}`,
					this.config.levelNumbered,
					`${treeIndex + 1}`,
					this.config.startShowLevel,
					this.levelNumberOffset
				);
				
				// Replace toggle placeholders with actual text
				const plainLines = treeLines.map(line => 
					line.replace(/\{\{TOGGLE:(.*?):(.*?)\}\}/g, '$2')
				);
				
				allLines.push(...plainLines);
				
				if (treeIndex < this.trees.length - 1) {
					allLines.push("");
				}
			});
		}
		
		return allLines.join("\n");
	}

	toggleTreeVisibility() {
		this.treeVisible = !this.treeVisible;
		this.render();
	}

	toggleNode(path: string) {
		if (this.expandedNodes.has(path)) {
			this.expandedNodes.delete(path);
		} else {
			this.expandedNodes.add(path);
		}
		this.render();
	}

	initializeExpandedNodes(maxDepth: number) {
		// Recursively add node paths up to maxDepth to expanded set
		const addPathsUpToDepth = (node: TreeNode, path: string, currentDepth: number) => {
			if (node.children && node.children.length > 0 && currentDepth < maxDepth) {
				this.expandedNodes.add(path);
				node.children.forEach((child: TreeNode, index: number) => {
					addPathsUpToDepth(child, `${path}/${index}`, currentDepth + 1);
				});
			}
		};

		this.trees.forEach((tree, treeIndex) => {
			const treePath = `tree${treeIndex}`;
			// Add root path if it has children and maxDepth > 1
			if (tree.children.length > 0 && maxDepth > 1) {
				this.expandedNodes.add(treePath);
			}
			tree.children.forEach((child: TreeNode, index: number) => {
				addPathsUpToDepth(child, `${treePath}/${index}`, 2);
			});
		});
	}
}
