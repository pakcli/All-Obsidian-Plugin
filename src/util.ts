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

/**
 * Tree configuration from inline flags
 */
export interface TreeConfig {
	interactive: boolean;
	startShowLevel: number; // 0 = collapsed (with more/less), 1+ = initially show that many levels
	levelNumbered: number; // 0 = no numbering, 1 = depth 0 only, 2 = depth 0-1, etc.
	title: string; // Title text (empty = no title)
}

/**
 * Parse result with config and trees
 */
export interface ParseResult {
	config: TreeConfig;
	trees: Node[];
}


interface parseLineOutput {
    depth: number;
    name: string;
    link: WikiLink | null;
}

/**
 * Parse configuration flags from source
 */
export function parseConfig(source: string): { config: TreeConfig; contentStart: number } {
	const lines = source.split("\n");
	const config: TreeConfig = {
		interactive: false,
		startShowLevel: 1, // Default: show root level only
		levelNumbered: 0,
		title: ""
	};
	
	let contentStart = 0;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		
		// Check if line is a config flag
		if (line.startsWith('-') && line.includes(':')) {
			const match = line.match(/^-(\w+):\s*(.*)$/i);
			if (match) {
				const flagName = match[1].toLowerCase();
				const flagValue = match[2].trim();
				
				if (flagName === 'interactive') {
					config.interactive = flagValue.toLowerCase() === 'true';
				} else if (flagName === 'startshowlevel' || flagName === 'showlevel' || flagName === 'expandall') {
					// Support startshowlevel, showlevel, and expandall for backwards compatibility
					const lower = flagValue.toLowerCase();
					if (lower === 'false') {
						config.startShowLevel = 0;
					} else if (lower === 'true') {
						config.startShowLevel = 1;
					} else {
						const num = parseInt(flagValue);
						config.startShowLevel = !isNaN(num) ? num : 1;
					}
				} else if (flagName === 'levelnumbered') {
					const num = parseInt(flagValue);
					config.levelNumbered = !isNaN(num) && num > 0 ? num : 0;
				} else if (flagName === 'title') {
					config.title = flagValue;
				}
				
				contentStart = i + 1;
			} else {
				// Not a valid config line, content starts here
				break;
			}
		} else if (line) {
			// Non-empty, non-config line found
			break;
		} else {
			// Empty line, skip
			contentStart = i + 1;
		}
	}
	
	return { config, contentStart };
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
 * @param levelNumbered Depth level for numbering (0 = no numbering)
 * @param numberPrefix Prefix for hierarchical numbering (e.g., "1" for root)
 * @param startShowLevel Initial depth level to show (0 = none, 1 = root only, 2 = root + children, etc.)
 * @returns An array of lines to display in the tree diagram,
 *          each line corresponds to a Node
 */
export function treeView(
    root: Node, 
    interactive: boolean = false, 
    expandedNodes: Set<string> = new Set(), 
    nodePath: string = "",
    levelNumbered: number = 0,
    numberPrefix: string = "",
    startShowLevel: number = 999
): string[] {
    let output: string[] = [];
    let queue: Array<{ node: Node; path: string; depth: number; number: string }> = [];

    // Root line with optional numbering and wikilink
    let rootLine = "";
    
    // Check if root should have interactive toggle
    const rootHasChildren = root.children.length > 0;
    const rootIsExpanded = expandedNodes.has(nodePath);
    
    if (interactive && rootHasChildren) {
        const indicator = rootIsExpanded ? "(•)" : "(>)";
        rootLine += `{{TOGGLE:${nodePath}:${indicator}}} `;
    }
    
    if (levelNumbered > 0 && root.depth < levelNumbered) {
        rootLine += `${numberPrefix}. `;
    }
    rootLine += root.name;
    if (root.link) {
        rootLine += ` [[${root.link.target}|${root.link.alias}]]`;
    }
    output.push(rootLine);

    // Add root children to queue with numbering
    // In interactive mode: only show if root is expanded (user controls)
    // In non-interactive mode: respect startShowLevel (startShowLevel > 1 means show children)
    const canShowRootChildren = interactive ? rootIsExpanded : (startShowLevel > 1);
    
    if (canShowRootChildren) {
        root.children.forEach((child, index) => {
            const childNumber = numberPrefix ? `${numberPrefix}.${index + 1}` : `${index + 1}`;
            queue.push({ 
                node: child, 
                path: `${nodePath}/${index}`,
                depth: child.depth,
                number: childNumber
            });
        });
    }

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;

        const { node, path, depth, number } = item;
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
            const indicator = isExpanded ? "(•)" : "(>)";
            line += `{{TOGGLE:${path}:${indicator}}} `;
        } else {
            // Normal mode - use branch char with its trailing space
            line += branchChar;
        }
        
        // Add numbering if enabled and within depth limit
        if (levelNumbered > 0 && depth < levelNumbered) {
            line += `${number}. `;
        }
        
        // If node has a link, render as wikilink
        if (node.link) {
            line += `[[${node.link.target}|${node.link.alias}]]`;
        } else {
            line += node.name;
        }

        output.push(line);

        // Add children to queue based on interactive mode
        // In interactive mode: only show children if node is expanded (user controls visibility)
        // In non-interactive mode: respect startShowLevel limit
        const canShowChildren = interactive ? isExpanded : (depth < startShowLevel - 1);
        
        if (canShowChildren) {
            const childQueue: Array<{ node: Node; path: string; depth: number; number: string }> = [];
            node.children.forEach((child, index) => {
                const childNumber = `${number}.${index + 1}`;
                childQueue.push({ 
                    node: child, 
                    path: `${path}/${index}`,
                    depth: child.depth,
                    number: childNumber
                });
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

/**
 * Parse source with configuration and trees
 */
export function parseWithConfig(source: string): ParseResult {
	const { config, contentStart } = parseConfig(source);
	const lines = source.split("\n");
	const content = lines.slice(contentStart).join("\n");
	
	// Parse all trees from content
	const trees = parseMultiInput(content);
	
	return { config, trees };
}
