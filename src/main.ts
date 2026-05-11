import { Plugin } from 'obsidian';
import { TreeDiagramMarkdownRenderChild } from './TreeDiagramMarkdownRenderChild';

export default class TreeDiagramPlugin extends Plugin {

	async onload() {
		this.registerMarkdownCodeBlockProcessor("tree", async (source, el, ctx) => {
			ctx.addChild(new TreeDiagramMarkdownRenderChild(this, source, el, ctx));
		});
	}

	onunload() { }
}
