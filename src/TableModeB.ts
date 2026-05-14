import TreeNode from './node';
import { TableDetector } from './TableDetector';

/**
 * Table Mode B - Folder TableView with drill-down navigation
 * Shows 2 hierarchy levels at a time with breadcrumb navigation
 */
export class TableModeB {
	private trees: TreeNode[];
	private contentColumns: string[];
	private navigationStack: string[] = [];
	private onNavigate?: (stack: string[]) => void;

	constructor(trees: TreeNode[], navigationStack: string[] = [], onNavigate?: (stack: string[]) => void) {
		this.trees = trees;
		this.contentColumns = TableDetector.collectContentColumns(trees);
		this.navigationStack = navigationStack;
		this.onNavigate = onNavigate;
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
	 * Get current subtree based on navigation stack
	 */
	private getCurrentSubtree(): TreeNode[] {
		if (this.navigationStack.length === 0) {
			return this.trees;
		}

		let current: TreeNode[] = this.trees;
		
		for (const nodeName of this.navigationStack) {
			const found = current.find(n => n.name === nodeName);
			if (!found || !found.children) {
				return [];
			}
			current = found.children;
		}

		return current;
	}

	/**
	 * Check if all children at next level are content columns (lowercase)
	 */
	private allChildrenAreContent(nodes: TreeNode[]): boolean {
		if (!nodes || nodes.length === 0) return false;
		
		for (const node of nodes) {
			if (node.children && node.children.length > 0) {
				const hasHierarchicalChild = node.children.some(c => TableDetector.isHierarchical(c));
				if (hasHierarchicalChild) return false;
			}
		}
		return true;
	}

	/**
	 * Render breadcrumb navigation
	 */
	private renderBreadcrumb(): HTMLElement {
		const breadcrumb = document.createElement('div');
		breadcrumb.className = 'table-breadcrumb';

		if (this.navigationStack.length === 0) {
			breadcrumb.textContent = 'Root';
			return breadcrumb;
		}

		this.navigationStack.forEach((item, index) => {
			if (index > 0) {
				const separator = document.createElement('span');
				separator.textContent = ' > ';
				separator.className = 'breadcrumb-separator';
				breadcrumb.appendChild(separator);
			}

			const link = document.createElement('a');
			link.textContent = item;
			link.className = 'breadcrumb-link';
			link.href = '#';
			link.onclick = (e) => {
				e.preventDefault();
				// Navigate to this level
				const newStack = this.navigationStack.slice(0, index + 1);
				if (this.onNavigate) {
					this.onNavigate(newStack);
				}
			};
			breadcrumb.appendChild(link);
		});

		return breadcrumb;
	}

	/**
	 * Render table for current navigation level
	 */
	render(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'tree-table-mode-b-container';

		// Breadcrumb is now rendered in top bar, not here

		const table = document.createElement('table');
		table.className = 'tree-table tree-table-mode-b';

		const currentNodes = this.getCurrentSubtree();
		const showContent = this.allChildrenAreContent(currentNodes);

		// Render header
		const thead = table.createTHead();
		const headerRow = thead.insertRow();

		// Current level header
		const currentLevelName = this.navigationStack.length > 0 
			? this.navigationStack[this.navigationStack.length - 1]
			: 'Level 1';
		
		const th1 = document.createElement('th');
		th1.textContent = TableDetector.capitalizeFirst(currentLevelName);
		headerRow.appendChild(th1);

		if (showContent) {
			// Show content columns
			this.contentColumns.forEach(col => {
				const th = document.createElement('th');
				th.textContent = TableDetector.capitalizeFirst(col);
				th.className = this.getColumnClass(col);
				headerRow.appendChild(th);
			});
		} else {
			// Show next level header
			const th2 = document.createElement('th');
			th2.textContent = `Level ${this.navigationStack.length + 2}`;
			headerRow.appendChild(th2);
		}

		// Render body
		const tbody = table.createTBody();
		this.renderRows(tbody, currentNodes, showContent);

		container.appendChild(table);
		return container;
	}

	/**
	 * Render table rows
	 */
	private renderRows(tbody: HTMLTableSectionElement, nodes: TreeNode[], showContent: boolean) {
		const hierarchicalNodes = nodes.filter(n => TableDetector.isHierarchical(n));

		if (hierarchicalNodes.length === 0) {
			// No hierarchical nodes - show empty row
			const tr = tbody.insertRow();
			const td = tr.insertCell();
			td.textContent = '—';
			td.colSpan = showContent ? this.contentColumns.length + 1 : 2;
			td.className = 'empty-cell';
			return;
		}

		// Group by parent for rowspan
		const grouped = this.groupByParent(hierarchicalNodes);

		grouped.forEach((group, groupIndex) => {
			group.nodes.forEach((node, nodeIndex) => {
				const tr = tbody.insertRow();

				// First column (current level) with rowspan
				if (nodeIndex === 0) {
					const td1 = tr.insertCell();
					
					// Check if node has wikilink
					if (node.link) {
						// Render as wikilink (not clickable for navigation)
						const link = document.createElement('a');
						link.className = 'internal-link';
						link.setAttribute('data-href', node.link.target);
						link.textContent = node.link.alias;
						td1.appendChild(link);
					} else {
						td1.textContent = group.parent || node.name;
						
						// Make clickable for navigation only if no wikilink and has hierarchical children
						if (!showContent && this.hasHierarchicalChildren(node)) {
							td1.className = 'clickable-cell';
							td1.onclick = () => {
								const newStack = [...this.navigationStack, node.name];
								if (this.onNavigate) {
									this.onNavigate(newStack);
								}
							};
						}
					}
					
					if (group.nodes.length > 1) {
						td1.rowSpan = group.nodes.length;
					}
				}

				if (showContent) {
					// Show content columns
					const contentMap = this.extractContent(node);
					this.contentColumns.forEach(col => {
						const td = tr.insertCell();
						const values = contentMap.get(col) || [];
						
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
				} else {
					// Show next level
					const td2 = tr.insertCell();
					const nextLevelNode = node.children && node.children.length > 0 
						? node.children.find(c => TableDetector.isHierarchical(c))
						: null;
					
					// Check if next level node has wikilink
					if (nextLevelNode && nextLevelNode.link) {
						// Render as wikilink (not clickable for navigation)
						const link = document.createElement('a');
						link.className = 'internal-link';
						link.setAttribute('data-href', nextLevelNode.link.target);
						link.textContent = nextLevelNode.link.alias;
						td2.appendChild(link);
					} else if (nextLevelNode) {
						td2.textContent = nextLevelNode.name;
						
						// Make clickable for navigation only if no wikilink and has hierarchical children
						if (this.hasHierarchicalChildren(nextLevelNode)) {
							td2.className = 'clickable-cell';
							td2.onclick = () => {
								const newStack = [...this.navigationStack, node.name];
								if (this.onNavigate) {
									this.onNavigate(newStack);
								}
							};
						}
					} else {
						td2.textContent = '—';
						td2.className = 'empty-cell';
					}
				}
			});
		});
	}

	/**
	 * Group nodes by parent for rowspan calculation
	 */
	private groupByParent(nodes: TreeNode[]): NodeGroup[] {
		// For Mode B, we don't group by parent in the same way as Mode A
		// Each node is its own group
		return nodes.map(node => ({
			parent: node.name,
			nodes: [node]
		}));
	}

	/**
	 * Check if node has hierarchical children
	 */
	private hasHierarchicalChildren(node: TreeNode): boolean {
		if (!node.children || node.children.length === 0) return false;
		return node.children.some(c => TableDetector.isHierarchical(c));
	}

	/**
	 * Extract content values from node
	 */
	private extractContent(node: TreeNode): Map<string, string[]> {
		const contentMap = new Map<string, string[]>();
		
		const traverse = (n: TreeNode) => {
			if (TableDetector.isContentColumn(n)) {
				const values: string[] = [];
				
				// Collect all child values
				if (n.children && n.children.length > 0) {
					n.children.forEach(child => {
						if (child.name) {
							// Check if child has wikilink
							if (child.link) {
								// If name is same as alias or empty, just use wikilink
								// Otherwise, include both name and wikilink
								if (child.name === child.link.alias || child.name.trim() === '') {
									values.push(`[[${child.link.target}|${child.link.alias}]]`);
								} else {
									values.push(`${child.name} [[${child.link.target}|${child.link.alias}]]`);
								}
							} else {
								values.push(child.name);
							}
						} else if (child.link) {
							// Node has no name, only wikilink
							values.push(`[[${child.link.target}|${child.link.alias}]]`);
						}
					});
				}
				
				contentMap.set(n.name, values);
			}
			if (n.children) {
				n.children.forEach(child => traverse(child));
			}
		};
		
		traverse(node);
		return contentMap;
	}

	/**
	 * Get CSS class for column based on name
	 */
	private getColumnClass(columnName: string): string {
		// Return consistent class for all columns
		return 'text-column';
	}
}

interface NodeGroup {
	parent: string;
	nodes: TreeNode[];
}
