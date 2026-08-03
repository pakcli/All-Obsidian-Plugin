import TreeNode from '../models/TreeNode';

/**
 * Detects node type based on capital letter presence
 * - Has capital letter anywhere → Hierarchical node
 * - No capital letters → Content node (column)
 */
export class TableDetector {
	/**
	 * Check if node name contains any capital letter (A-Z)
	 */
	static hasCapital(name: string): boolean {
		return /[A-Z]/.test(name);
	}

	/**
	 * Determine if node is hierarchical (has capital) or content (no capital)
	 */
	static isHierarchical(node: TreeNode): boolean {
		return this.hasCapital(node.name);
	}

	/**
	 * Determine if node is content column (no capitals)
	 */
	static isContentColumn(node: TreeNode): boolean {
		return !this.hasCapital(node.name);
	}

	/**
	 * Scan entire tree and collect all unique content column names
	 */
	static collectContentColumns(trees: TreeNode[]): string[] {
		const columns = new Set<string>();
		
		const traverse = (node: TreeNode) => {
			if (this.isContentColumn(node)) {
				columns.add(node.name);
			}
			if (node.children) {
				node.children.forEach(child => traverse(child));
			}
		};
		
		trees.forEach(tree => traverse(tree));
		return Array.from(columns);
	}

	/**
	 * Get max depth of hierarchical nodes in tree
	 */
	static getMaxHierarchicalDepth(trees: TreeNode[]): number {
		let maxDepth = 0;
		
		const traverse = (node: TreeNode, depth: number) => {
			if (this.isHierarchical(node)) {
				maxDepth = Math.max(maxDepth, depth);
				if (node.children) {
					node.children.forEach(child => traverse(child, depth + 1));
				}
			}
		};
		
		trees.forEach(tree => traverse(tree, 1));
		return maxDepth;
	}

	/**
	 * Capitalize first letter of string
	 */
	static capitalizeFirst(str: string): string {
		if (!str) return str;
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	/**
	 * Handle duplicate node names by appending index
	 */
	static handleDuplicates(names: string[]): string[] {
		const counts = new Map<string, number>();
		return names.map(name => {
			const count = counts.get(name) || 0;
			counts.set(name, count + 1);
			return count > 0 ? `${name} (${count + 1})` : name;
		});
	}

	/**
	 * Escape HTML special characters
	 */
	static escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
}

/**
 * Extract content values from node
 */
export function extractContent(node: TreeNode): Map<string, string[]> {
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
