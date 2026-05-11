import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { parseMultiInput, treeView, copyToClipboard, enableWikiLinks } from './util';
import TreeDiagramPlugin from "./main";

export interface TreeOptions {
	interactive: boolean;
	expandAll: boolean;
}

export class TreeDiagramMarkdownRenderChild extends MarkdownRenderChild {
	plugin: TreeDiagramPlugin;
	source: string;
	ctx: MarkdownPostProcessorContext;
	options: TreeOptions;
	expandedNodes: Set<string>;

	constructor(
		plugin: TreeDiagramPlugin,
		source: string,
		containerEl: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		options: TreeOptions
	) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.ctx = ctx;
		this.options = options;
		this.expandedNodes = new Set<string>();
	}

	async onload() {
		this.render();
	}

	render() {
		// Clear container
		this.containerEl.empty();

		const trees = parseMultiInput(this.source);
		if (trees.length === 0) return;

		// Initialize expanded nodes if expandAll is true
		if (this.options.interactive && this.options.expandAll && this.expandedNodes.size === 0) {
			this.initializeExpandedNodes(trees);
		}

		const wrapper = this.containerEl.createDiv();
		wrapper.style.position = "relative";

		const pre = wrapper.createEl("pre");
		Object.assign(pre.style, {
			margin: "0",
			whiteSpace: "pre",
			fontFamily: "var(--font-monospace)",
		});

		// Render all trees
		const allLines: string[] = [];
		trees.forEach((tree, treeIndex) => {
			const treeLines = treeView(
				tree, 
				this.options.interactive, 
				this.expandedNodes, 
				`tree${treeIndex}`
			);
			allLines.push(...treeLines);
			
			// Add separator between trees (except after last tree)
			if (treeIndex < trees.length - 1) {
				allLines.push(""); // Blank line separator
			}
		});

		const fullText = allLines.join("\n");

		// Escape HTML first to preserve ASCII characters
		const escapeHtml = (text: string) => {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		};

		// Escape HTML
		let htmlContent = escapeHtml(fullText);
		
		// Replace toggle placeholders with actual HTML spans
		htmlContent = htmlContent.replace(/\{\{TOGGLE:(.*?):(.*?)\}\}/g, 
			'<span class="tree-toggle" data-path="$1">$2</span>');
		
		// Replace wikilinks
		htmlContent = htmlContent.replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (_, target, alias) => {
			const display = alias ? alias : target;
			return `<a class="internal-link" data-href="${target.trim()}">${display.trim()}</a>`;
		});

		pre.innerHTML = htmlContent;

		enableWikiLinks(pre, this.plugin.app, this.ctx.sourcePath);

		// Add click handlers for interactive toggles
		if (this.options.interactive) {
			pre.querySelectorAll(".tree-toggle").forEach((toggle) => {
				const span = toggle as HTMLSpanElement;
				
				span.onclick = (e: MouseEvent) => {
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
			right: "32px",
			fontSize: "11px",
		});

		copyBtn.onclick = async () => {
			const ok = await copyToClipboard(pre.innerText);
			copyBtn.textContent = ok ? "Copied!" : "Fail";
			setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
		};
	}

	toggleNode(path: string) {
		if (this.expandedNodes.has(path)) {
			this.expandedNodes.delete(path);
		} else {
			this.expandedNodes.add(path);
		}
		this.render();
	}

	initializeExpandedNodes(trees: any[]) {
		// Recursively add all node paths to expanded set
		const addAllPaths = (node: any, path: string) => {
			if (node.children && node.children.length > 0) {
				this.expandedNodes.add(path);
				node.children.forEach((child: any, index: number) => {
					addAllPaths(child, `${path}/${index}`);
				});
			}
		};

		trees.forEach((tree, treeIndex) => {
			tree.children.forEach((child: any, index: number) => {
				addAllPaths(child, `tree${treeIndex}/${index}`);
			});
		});
	}
}
