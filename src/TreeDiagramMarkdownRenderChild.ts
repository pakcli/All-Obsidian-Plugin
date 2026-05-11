import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { parseInput, treeView } from './util';
import { MarkdownRenderer } from 'obsidian';
import TreeDiagramPlugin from "./main";

export class TreeDiagramMarkdownRenderChild extends MarkdownRenderChild {
	plugin: TreeDiagramPlugin;
	source: string;
	ctx: MarkdownPostProcessorContext;

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
	}

	async onload() {
		let root;
		let output: string[] = [];
		let markdown: string;

		root = parseInput(this.source);
		if (root != null) {
			output = treeView(root);
		}
		markdown = ["```", "\n", output.join("\n").trim(), "\n```"].join("");
		await MarkdownRenderer.render(this.plugin.app, markdown, this.containerEl, this.ctx.sourcePath, this);
	}
}
