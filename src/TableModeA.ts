import TreeNode from './node';
import { TableDetector } from './TableDetector';

/**
 * Table Mode A - Full View with rowspan
 * Displays all leaf nodes in one flat table with vertical merging
 */
export class TableModeA {
	private trees: TreeNode[];
	private contentColumns: string[];
	private maxDepth: number;

	constructor(trees: TreeNode[]) {
		this.trees = trees;
		this.contentColumns = TableDetector.collectContentColumns(trees);
		this.maxDepth = TableDetector.getMaxHierarchicalDepth(trees);
	}

	/**
	 * Flatten tree into array of leaf paths
	 * Each path contains full hierarchy + content values
	 */
	private flattenToLeafPaths(): LeafPath[] {
		const paths: LeafPath[] = [];

		const traverse = (node: TreeNode, currentPath: string[], currentNodes: TreeNode[], contentMap: Map<string, string[]>) => {
			if (TableDetector.isHierarchical(node)) {
				// Hierarchical node - add to path
				const newPath = [...currentPath, node.name];
				const newNodes = [...currentNodes, node];
				
				if (node.children && node.children.length > 0) {
					// Check if all children are content columns
					const allChildrenAreContent = node.children.every(c => TableDetector.isContentColumn(c));
					
					if (allChildrenAreContent) {
						// This is a leaf hierarchical node with content children
						// Collect all content values into one map (supporting multiple values per column)
						const leafContentMap = new Map<string, string[]>();
						node.children.forEach(child => {
							const values: string[] = [];
							
							// Collect all child values
							if (child.children && child.children.length > 0) {
								child.children.forEach(grandchild => {
									if (grandchild.name) {
										// Check if grandchild has wikilink
										if (grandchild.link) {
											// If name is same as alias or empty, just use wikilink
											// Otherwise, include both name and wikilink
											if (grandchild.name === grandchild.link.alias || grandchild.name.trim() === '') {
												values.push(`[[${grandchild.link.target}|${grandchild.link.alias}]]`);
											} else {
												values.push(`${grandchild.name} [[${grandchild.link.target}|${grandchild.link.alias}]]`);
											}
										} else {
											values.push(grandchild.name);
										}
									} else if (grandchild.link) {
										// Node has no name, only wikilink
										values.push(`[[${grandchild.link.target}|${grandchild.link.alias}]]`);
									}
								});
							}
							
							leafContentMap.set(child.name, values);
						});
						
						// Create single path entry with all content
						paths.push({
							hierarchy: newPath,
							hierarchyNodes: newNodes,
							content: leafContentMap
						});
					} else {
						// Has hierarchical children - continue traversing
						node.children.forEach(child => traverse(child, newPath, newNodes, new Map()));
					}
				} else {
					// Leaf hierarchical node with no children
					paths.push({
						hierarchy: newPath,
						hierarchyNodes: newNodes,
						content: new Map()
					});
				}
			}
		};

		this.trees.forEach(tree => traverse(tree, [], [], new Map()));
		return paths;
	}

	/**
	 * Calculate rowspan for each cell at each depth
	 */
	private calculateRowspans(paths: LeafPath[]): RowspanInfo[][] {
		const rowspans: RowspanInfo[][] = [];

		for (let depth = 0; depth < this.maxDepth; depth++) {
			const depthRowspans: RowspanInfo[] = [];
			let i = 0;

			while (i < paths.length) {
				const currentPath = paths[i].hierarchy.slice(0, depth + 1).join('/');
				let span = 1;

				// Count consecutive rows with same path up to this depth
				while (i + span < paths.length) {
					const nextPath = paths[i + span].hierarchy.slice(0, depth + 1).join('/');
					if (nextPath === currentPath) {
						span++;
					} else {
						break;
					}
				}

				depthRowspans.push({ rowIndex: i, span });
				i += span;
			}

			rowspans.push(depthRowspans);
		}

		return rowspans;
	}

	/**
	 * Parse wikilinks in text and create HTML with proper link elements
	 */
	private parseWikilinks(text: string): DocumentFragment {
		const fragment = document.createDocumentFragment();
		
		// Regex to match [[target|alias]] or [[target]]
		const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		let lastIndex = 0;
		let match;
		
		console.log(`[parseWikilinks] Parsing text: "${text}"`);
		
		while ((match = wikilinkRegex.exec(text)) !== null) {
			console.log(`[parseWikilinks] Found wikilink: ${match[0]}`);
			
			// Add text before the wikilink
			if (match.index > lastIndex) {
				const textNode = document.createTextNode(text.substring(lastIndex, match.index));
				fragment.appendChild(textNode);
			}
			
			// Create wikilink element
			const target = match[1].trim();
			const alias = match[2] ? match[2].trim() : target;
			
			console.log(`[parseWikilinks] Creating link: target="${target}", alias="${alias}"`);
			
			const link = document.createElement('a');
			link.className = 'internal-link';
			link.setAttribute('data-href', target);
			link.textContent = alias;
			fragment.appendChild(link);
			
			lastIndex = match.index + match[0].length;
		}
		
		// Add remaining text
		if (lastIndex < text.length) {
			const textNode = document.createTextNode(text.substring(lastIndex));
			fragment.appendChild(textNode);
		}
		
		return fragment;
	}

	/**
	 * Render table HTML
	 */
	render(): HTMLTableElement {
		const table = document.createElement('table');
		table.className = 'tree-table tree-table-mode-a';

		// Render header
		const thead = table.createTHead();
		const headerRow = thead.insertRow();

		// Hierarchy columns
		for (let i = 0; i < this.maxDepth; i++) {
			const th = document.createElement('th');
			th.textContent = `Level ${i + 1}`;
			headerRow.appendChild(th);
		}

		// Content columns
		this.contentColumns.forEach(col => {
			const th = document.createElement('th');
			th.textContent = TableDetector.capitalizeFirst(col);
			th.className = this.getColumnClass(col);
			headerRow.appendChild(th);
		});

		// Render body
		const tbody = table.createTBody();
		const paths = this.flattenToLeafPaths();
		const rowspans = this.calculateRowspans(paths);

		paths.forEach((path, rowIndex) => {
			const tr = tbody.insertRow();

			// Hierarchy cells with rowspan
			for (let depth = 0; depth < this.maxDepth; depth++) {
				const rowspanInfo = rowspans[depth].find(r => r.rowIndex === rowIndex);
				
				if (rowspanInfo) {
					const td = tr.insertCell();
					const value = path.hierarchy[depth] || '—';
					const node = path.hierarchyNodes[depth];
					
					// Check if node has wikilink
					if (node && node.link) {
						// Render as wikilink
						const link = document.createElement('a');
						link.className = 'internal-link';
						link.setAttribute('data-href', node.link.target);
						link.textContent = node.link.alias;
						td.appendChild(link);
					} else {
						td.textContent = value;
					}
					
					if (rowspanInfo.span > 1) {
						td.rowSpan = rowspanInfo.span;
					}
					
					if (value === '—') {
						td.className = 'empty-cell';
					}
				}
				// Skip cells that are part of a rowspan from previous row
			}

			// Content cells
			this.contentColumns.forEach(col => {
				const td = tr.insertCell();
				const values = path.content.get(col) || [];
				
				if (values.length > 0) {
					// Parse each value for wikilinks and join with <br>
					values.forEach((value, index) => {
						if (index > 0) {
							// Add <br> between values
							td.appendChild(document.createElement('br'));
						}
						// Parse wikilinks in the value
						const fragment = this.parseWikilinks(value);
						td.appendChild(fragment);
					});
				} else {
					td.textContent = '';
					td.classList.add('empty-cell');
				}
				
				td.className = this.getColumnClass(col);
			});
		});

		return table;
	}

	/**
	 * Get CSS class for column based on name
	 */
	private getColumnClass(columnName: string): string {
		// Return consistent class for all columns
		return 'text-column';
	}
}

interface LeafPath {
	hierarchy: string[];
	hierarchyNodes: TreeNode[]; // Store node references for wikilink access
	content: Map<string, string[]>;
}

interface RowspanInfo {
	rowIndex: number;
	span: number;
}
