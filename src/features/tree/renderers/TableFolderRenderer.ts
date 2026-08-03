import TreeNode from '../models/TreeNode';
import { TableDetector, extractContent } from '../utils/tableAnalysis';
import { parseWikilinks } from '../utils/rendering';

/**
 * Table Mode B - Folder TableView with drill-down navigation
 * Shows 2 hierarchy levels at a time with breadcrumb navigation
 */
export class TableFolderRenderer {
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
	 * Render table for current navigation level
	 */
	render(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'tree-table-mode-b-container';

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

		grouped.forEach((group) => {
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
					const contentMap = extractContent(node);
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
								const fragment = parseWikilinks(value);
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
	 * Get CSS class for column based on name
	 */
	private getColumnClass(_columnName: string): string {
		// Return consistent class for all columns
		return 'text-column';
	}
}

interface NodeGroup {
	parent: string;
	nodes: TreeNode[];
}
