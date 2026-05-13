import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { parseWithConfig, treeView, copyToClipboard, enableWikiLinks, TreeConfig } from './util';
import TreeDiagramPlugin from "./main";
import TreeNode from './node';

export class TreeDiagramMarkdownRenderChild extends MarkdownRenderChild {
	plugin: TreeDiagramPlugin;
	source: string;
	ctx: MarkdownPostProcessorContext;
	config: TreeConfig;
	trees: TreeNode[];
	expandedNodes: Set<string>;
	treeVisible: boolean; // Track if tree content is visible (for collapsible title)

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
		
		// Initialize tree visibility based on startShowLevel
		// If startShowLevel is 0, tree starts collapsed (hidden)
		// Otherwise, tree is always visible
		this.treeVisible = this.config.startShowLevel !== 0;
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

		// Add control panel (top-right)
		this.renderControlPanel(wrapper);

		const pre = wrapper.createEl("pre");
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
					this.config.startShowLevel // Pass startShowLevel to control visible depth
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
		
		// Replace wikilinks
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

		// Copy button
		const copyBtn = wrapper.createEl("button", { text: "Copy" });
		Object.assign(copyBtn.style, {
			position: "absolute",
			top: "4px",
			right: "4px",
			fontSize: "11px",
		});

		copyBtn.onclick = async () => {
			// Copy the plain text version with toggles included
			const ok = await copyToClipboard(plainTextForCopy);
			copyBtn.textContent = ok ? "Copied!" : "Fail";
			setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
		};
	}

	renderControlPanel(wrapper: HTMLElement) {
		const controlsWrapper = wrapper.createDiv({ cls: 'tree-controls-wrapper' });
		
		// Detect if mobile
		const isMobile = window.innerWidth < 768;
		
		if (isMobile) {
			// Mobile: Show hamburger menu button
			this.renderMobileControls(controlsWrapper);
		} else {
			// Desktop: Show inline controls
			this.renderDesktopControls(controlsWrapper);
		}
		
		// Copy button (always visible)
		const copyBtn = controlsWrapper.createEl("button", { 
			text: "Copy",
			cls: 'tree-control-button'
		});
		
		copyBtn.onclick = async () => {
			const plainText = this.getPlainTextForCopy();
			const ok = await copyToClipboard(plainText);
			copyBtn.textContent = ok ? "Copied!" : "Fail";
			setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
		};
	}

	renderDesktopControls(wrapper: HTMLElement) {
		const inlineControls = wrapper.createDiv({ cls: 'tree-controls-inline' });
		
		// Interactive toggle button
		const interactiveBtn = inlineControls.createEl("button", {
			text: this.config.interactive ? "🔧 Interactive" : "Interactive",
			cls: 'tree-control-button'
		});
		if (this.config.interactive) {
			interactiveBtn.style.background = "var(--interactive-accent)";
			interactiveBtn.style.color = "var(--text-on-accent)";
		}
		interactiveBtn.onclick = () => {
			this.config.interactive = !this.config.interactive;
			this.render();
		};
		
		// Show Level spinner
		const showLevelSpinner = this.createSpinner(
			"Show",
			this.config.startShowLevel,
			0,
			10,
			(value) => {
				this.config.startShowLevel = value;
				this.treeVisible = value > 0;
				// Re-initialize expanded nodes if needed
				if (this.config.interactive && value > 1) {
					this.expandedNodes.clear();
					this.initializeExpandedNodes(value);
				}
				this.render();
			}
		);
		inlineControls.appendChild(showLevelSpinner);
		
		// Numbering spinner
		const numberingSpinner = this.createSpinner(
			"Num",
			this.config.levelNumbered,
			0,
			10,
			(value) => {
				this.config.levelNumbered = value;
				this.render();
			}
		);
		inlineControls.appendChild(numberingSpinner);
	}

	renderMobileControls(wrapper: HTMLElement) {
		// Hamburger menu button
		const menuBtn = wrapper.createEl("button", {
			text: "☰",
			cls: 'tree-menu-button'
		});
		
		// Dropdown menu
		const menu = wrapper.createDiv({ cls: 'tree-controls-menu' });
		
		// Interactive toggle
		const interactiveItem = menu.createDiv({ cls: 'tree-controls-menu-item' });
		interactiveItem.createEl("label", {
			text: "Interactive Mode",
			cls: 'tree-controls-menu-label'
		});
		const interactiveBtn = interactiveItem.createEl("button", {
			text: this.config.interactive ? "🔧 ON" : "OFF",
			cls: 'tree-control-button'
		});
		if (this.config.interactive) {
			interactiveBtn.style.background = "var(--interactive-accent)";
			interactiveBtn.style.color = "var(--text-on-accent)";
		}
		interactiveBtn.onclick = () => {
			this.config.interactive = !this.config.interactive;
			menu.removeClass('open');
			this.render();
		};
		
		// Show Level spinner
		const showLevelItem = menu.createDiv({ cls: 'tree-controls-menu-item' });
		showLevelItem.createEl("label", {
			text: "Show Level",
			cls: 'tree-controls-menu-label'
		});
		const showLevelSpinner = this.createSpinner(
			"",
			this.config.startShowLevel,
			0,
			10,
			(value) => {
				this.config.startShowLevel = value;
				this.treeVisible = value > 0;
				// Re-initialize expanded nodes if needed
				if (this.config.interactive && value > 1) {
					this.expandedNodes.clear();
					this.initializeExpandedNodes(value);
				}
				this.render();
			}
		);
		showLevelItem.appendChild(showLevelSpinner);
		
		// Numbering spinner
		const numberingItem = menu.createDiv({ cls: 'tree-controls-menu-item' });
		numberingItem.createEl("label", {
			text: "Numbering",
			cls: 'tree-controls-menu-label'
		});
		const numberingSpinner = this.createSpinner(
			"",
			this.config.levelNumbered,
			0,
			10,
			(value) => {
				this.config.levelNumbered = value;
				this.render();
			}
		);
		numberingItem.appendChild(numberingSpinner);
		
		// Toggle menu on click
		menuBtn.onclick = () => {
			if (menu.hasClass('open')) {
				menu.removeClass('open');
			} else {
				menu.addClass('open');
			}
		};
		
		// Close menu when clicking outside
		document.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (!menuBtn.contains(target) && !menu.contains(target)) {
				menu.removeClass('open');
			}
		});
	}

	createSpinner(label: string, value: number, min: number, max: number, onChange: (value: number) => void): HTMLElement {
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
		decreaseBtn.textContent = "◀";
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
		increaseBtn.textContent = "▶";
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
					this.config.startShowLevel
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
