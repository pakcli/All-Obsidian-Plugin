import Node, { WikiLink } from './node';
import { TFolder } from 'obsidian';

const EDGE = "├── ";
const CORNER = "└── ";
const LINE = "│   ";
const BLANK = "    ";

// Electron clipboard (may not be available in all environments)
let electronClipboard: { writeText: (text: string) => void } | null = null;

try {
	electronClipboard = require("electron").clipboard;
} catch (_) {
	// Electron not available, will fall back to navigator.clipboard
}


interface parseLineOutput {
    depth: number;
    name: string;
    link: WikiLink | null;
}

/**
 * Parse a line of input text to Node properties.
 * @param text A line of input
 * @returns parseLineOutput Parsed Node properties
 */
function parseLine(text: string): parseLineOutput {
    let depth = 0;
    let index = 0;

    // Calculate depth from tabs
    while (text.charAt(index) === "\t") {
        depth++;
        index++;
    }
    
    const raw = text.substring(index).trim();
    
    // Match [[target|alias]] OR [[target]]
    const match = raw.match(/\[\[(.*?)(?:\|(.*?))?\]\]/);
    let link: WikiLink | null = null;

    if (match && match[1]) {
        const target = match[1].trim();
        const alias = match[2] ? match[2].trim() : target;
        link = { target, alias };
    }

    // Remove the wikilink portion to get plain name
    let name = raw.replace(/\[\[.*?\]\]/, "").trim();

    // If node is purely a wikilink with no extra text, use alias as display name
    if (!name && link) {
        name = link.alias;
    }

    return {
        depth,
        name,
        link
    };
}

/**
 * Parse input text into a hierarchy of Nodes (single tree).
 * @param source Input
 * @returns The root node of the tree, or null if source is empty
 */
export function parseInput(source: string): Node | null {
    const trees = parseMultiInput(source);
    return trees.length > 0 ? trees[0] : null;
}

/**
 * Parse input text into multiple tree hierarchies.
 * Automatically detects multiple trees when there are multiple depth-0 nodes.
 * @param source Input
 * @returns Array of root nodes
 */
export function parseMultiInput(source: string): Node[] {
    const lines: string[] = source.trim().split("\n");
    if (lines.length === 0) return [];

    const trees: Node[] = [];
    let currentRoot: Node | null = null;
    let lastNode: Node | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const { depth, name, link } = parseLine(line);
        if (!name) continue;

        // Depth 0 means a new root node (new tree)
        if (depth === 0) {
            currentRoot = new Node(name, 0, null, true, link);
            trees.push(currentRoot);
            lastNode = currentRoot;
            continue;
        }

        // If no root yet, skip this line
        if (!currentRoot) continue;

        // Parse regular node
        const node = new Node(name, depth, null, false, link);

        if (lastNode) {
            if (node.depth === lastNode.depth) {
                lastNode.parent?.addChild(node);
            } else if (node.depth > lastNode.depth) {
                lastNode.addChild(node);
            } else {
                let diff = lastNode.depth - node.depth;
                let parent: Node | null = lastNode.parent;

                if (parent == null) {
                    // If we can't find parent, skip this node
                    continue;
                }

                while (diff > 0 && parent) {
                    parent = parent.parent;
                    diff--;
                }
                
                if (parent) {
                    parent.addChild(node);
                }
            }
            lastNode = node;
        }
    }

    return trees;
}

/**
 * Parse a hierarchy of Nodes into corresponding text to display in tree diagram.
 * 
 * @param root The root node
 * @param interactive Whether to add expand/collapse indicators
 * @param expandedNodes Set of node paths that are expanded (for interactive mode)
 * @param nodePath Current node path for tracking
 * @returns An array of lines to display in the tree diagram,
 *          each line corresponds to a Node
 */
export function treeView(
    root: Node, 
    interactive: boolean = false, 
    expandedNodes: Set<string> = new Set(), 
    nodePath: string = ""
): string[] {
    let output: string[] = [];
    let queue: Array<{ node: Node; path: string }> = [];

    // Root line with optional wikilink
    let rootLine = root.name;
    if (root.link) {
        rootLine += ` [[${root.link.target}|${root.link.alias}]]`;
    }
    output.push(rootLine);

    // Add root children to queue
    root.children.forEach((child, index) => {
        queue.push({ node: child, path: `${nodePath}/${index}` });
    });

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;

        const { node, path } = item;
        const isExpanded = expandedNodes.has(path);
        const hasChildren = node.children.length > 0;

        let line = "";
        let n = node.parent;
        
        // Build indentation
        while (n) {
            if (n === root) break;
            if (n.isLast === true) {
                line = BLANK + line;
            } else {
                line = LINE + line;
            }
            n = n.parent;
        }
        
        // Add branch character (├── or └──)
        const branchChar = node.isLast ? CORNER : EDGE;
        
        // Add interactive indicator AFTER branch character if needed
        if (interactive && hasChildren) {
            // Remove trailing space from branch char and add indicator
            line += branchChar.trimEnd();
            const indicator = isExpanded ? "(v)" : "(>)";
            line += `{{TOGGLE:${path}:${indicator}}} `;
        } else {
            // Normal mode - use branch char with its trailing space
            line += branchChar;
        }
        
        // If node has a link, render as wikilink
        if (node.link) {
            line += `[[${node.link.target}|${node.link.alias}]]`;
        } else {
            line += node.name;
        }

        output.push(line);

        // Add children to queue if expanded or not interactive
        if (!interactive || isExpanded) {
            const childQueue: Array<{ node: Node; path: string }> = [];
            node.children.forEach((child, index) => {
                childQueue.push({ node: child, path: `${path}/${index}` });
            });
            queue = [...childQueue, ...queue];
        }
    }

    return output;
}

/**
 * Copy text to system clipboard
 * @returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (electronClipboard) {
			electronClipboard.writeText(text);
		} else {
			await navigator.clipboard.writeText(text);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Enable wikilink navigation in a container element
 */
export function enableWikiLinks(
	container: HTMLElement,
	app: any,
	sourcePath: string
): void {
	container.querySelectorAll("a.internal-link").forEach((link) => {
		const anchor = link as HTMLAnchorElement;
		anchor.onclick = (e: MouseEvent) => {
			e.preventDefault();
			const href = anchor.dataset.href;
			if (href) {
				app.workspace.openLinkText(href, sourcePath);
			}
		};
	});
}

/**
 * Build tab-indented tree from a folder structure
 */
export function buildTabTree(
	folder: TFolder,
	includeFiles: boolean = true,
	depth: number = 0
): string[] {
	let output: string[] = [];

	if (depth === 0) {
		output.push(folder.name);
	}

	const items = folder.children
		.filter((i) => includeFiles || i instanceof TFolder)
		.sort((a, b) => {
			// Folders before files
			if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
			if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
			// Alphabetical within category
			return a.name.localeCompare(b.name);
		});

	items.forEach((item) => {
		output.push(`${"\t".repeat(depth + 1)}${item.name}`);
		if (item instanceof TFolder) {
			output = output.concat(buildTabTree(item, includeFiles, depth + 1));
		}
	});

	return output;
}
