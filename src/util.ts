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
	offsetLevelNumbered: number; // Offset for numbering (0 = root is 1, 1 = root has no number)
	currentView: number; // 1 = tree, 2 = table full, 3 = table folder
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
		title: "",
		offsetLevelNumbered: 0,
		currentView: 1 // Default: tree view
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
				} else if (flagName === 'offsetlevelnumbered') {
					const num = parseInt(flagValue);
					config.offsetLevelNumbered = !isNaN(num) && num >= 0 ? num : 0;
				} else if (flagName === 'currentview') {
					const num = parseInt(flagValue);
					config.currentView = !isNaN(num) && num >= 1 && num <= 3 ? num : 1;
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

    // Keep the full text including wikilinks for mixed content support
    let name = raw;

    // If node is purely a wikilink with no extra text, use alias as display name
    const textWithoutWikilink = raw.replace(/\[\[.*?\]\]/g, "").trim();
    if (!textWithoutWikilink && link) {
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
 * @param levelNumberOffset Offset for numbering depth (0 = root is 1, 1 = root has no number, level 2 is 1, etc.)
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
    startShowLevel: number = 999,
    levelNumberOffset: number = 0
): string[] {
    let output: string[] = [];
    let queue: Array<{ node: Node; path: string; depth: number; numberParts: number[] }> = [];

    // Root line with optional numbering and wikilink
    let rootLine = "";
    
    // Check if root should have interactive toggle
    const rootHasChildren = root.children.length > 0;
    const rootIsExpanded = expandedNodes.has(nodePath);
    
    if (interactive && rootHasChildren) {
        const indicator = rootIsExpanded ? "(v)" : "(>)";
        rootLine += `{{TOGGLE:${nodePath}:${indicator}}} `;
    }
    
    // Apply offset to numbering
    // Offset 0: root (depth 0) gets numbered → 1. Root, 1.1. Child
    // Offset 1: root (depth 0) no number, children (depth 1) get numbered → Root, 1. Child, 1.1. Grandchild
    // Offset 2: root and children no number, grandchildren (depth 2) get numbered → Root, Child, 1. Grandchild
    const rootRelativeDepth = 0; // Root is always at relative depth 0
    if (levelNumbered > 0 && rootRelativeDepth >= levelNumberOffset && (rootRelativeDepth - levelNumberOffset) < levelNumbered) {
        // Root gets numbered only if offset is 0
        rootLine += `${numberPrefix}. `;
    }
    // Add root name (which may include wikilinks)
    rootLine += root.name;
    output.push(rootLine);

    // Add root children to queue with numbering
    // In interactive mode: only show if root is expanded (user controls)
    // In non-interactive mode: respect startShowLevel (startShowLevel > 1 means show children)
    const canShowRootChildren = interactive ? rootIsExpanded : (startShowLevel > 1);
    
    if (canShowRootChildren) {
        root.children.forEach((child, index) => {
            // If offset is 0, children continue from root number (e.g., 1.1, 1.2)
            // If offset >= 1, children start fresh numbering (e.g., 1, 2)
            const childDepth = 1;
            let childNumberParts: number[];
            
            if (levelNumberOffset === 0) {
                // No offset: continue from root (1.1, 1.2, ...)
                const rootNum = numberPrefix ? parseInt(numberPrefix) : 1;
                childNumberParts = [rootNum, index + 1];
            } else if (childDepth === levelNumberOffset) {
                // This level is where numbering starts
                childNumberParts = [index + 1];
            } else if (childDepth > levelNumberOffset) {
                // This level is after offset, shouldn't happen for direct children
                childNumberParts = [index + 1];
            } else {
                // This level is before offset, no numbering yet
                childNumberParts = [];
            }
            
            queue.push({ 
                node: child, 
                path: `${nodePath}/${index}`,
                depth: childDepth,
                numberParts: childNumberParts
            });
        });
    }

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;

        const { node, path, depth, numberParts } = item;
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
        
        // Add numbering if this level should have numbers
        // Only add number if:
        // 1. levelNumbered > 0 (numbering is enabled)
        // 2. depth >= levelNumberOffset (we've reached the offset level)
        // 3. numberParts is not empty (this level gets numbered)
        // 4. (depth - levelNumberOffset) < levelNumbered (within numbering depth limit)
        if (levelNumbered > 0 && depth >= levelNumberOffset && numberParts.length > 0 && (depth - levelNumberOffset) < levelNumbered) {
            const numberStr = numberParts.join('.');
            line += `${numberStr}. `;
        }
        
        // Add node name (which may include wikilinks)
        line += node.name;

        output.push(line);

        // Add children to queue based on interactive mode
        // In interactive mode: only show children if node is expanded (user controls visibility)
        // In non-interactive mode: respect startShowLevel limit
        const canShowChildren = interactive ? isExpanded : (depth < startShowLevel - 1);
        
        if (canShowChildren) {
            const childQueue: Array<{ node: Node; path: string; depth: number; numberParts: number[] }> = [];
            node.children.forEach((child, index) => {
                const childDepth = depth + 1;
                let childNumberParts: number[];
                
                if (childDepth < levelNumberOffset) {
                    // Before offset level, no numbering
                    childNumberParts = [];
                } else if (childDepth === levelNumberOffset) {
                    // This is the offset level, start fresh numbering
                    childNumberParts = [index + 1];
                } else {
                    // After offset level, continue numbering
                    if (numberParts.length > 0) {
                        childNumberParts = [...numberParts, index + 1];
                    } else {
                        // Parent had no number, start fresh
                        childNumberParts = [index + 1];
                    }
                }
                
                childQueue.push({ 
                    node: child, 
                    path: `${path}/${index}`,
                    depth: childDepth,
                    numberParts: childNumberParts
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
 * Makes links clickable and enables hover preview
 */
export function enableWikiLinks(
	container: HTMLElement,
	app: any,
	sourcePath: string
): void {
	container.querySelectorAll("a.internal-link").forEach((link) => {
		const anchor = link as HTMLAnchorElement;
		const href = anchor.dataset.href;
		
		if (href) {
			// Set href attribute for proper link behavior
			anchor.setAttribute('href', href);
			
			// Add data-tooltip-position for hover preview
			anchor.setAttribute('data-tooltip-position', 'top');
			
			// Add aria-label for accessibility
			anchor.setAttribute('aria-label', href);
			
			// Set target to make it an internal link
			anchor.setAttribute('target', '_blank');
			anchor.setAttribute('rel', 'noopener');
			
			// Handle click to open link
			anchor.onclick = (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				app.workspace.openLinkText(href, sourcePath, e.ctrlKey || e.metaKey);
			};
			
			// Handle hover for preview (Obsidian will handle this automatically with proper attributes)
			anchor.addEventListener('mouseenter', (e: MouseEvent) => {
				// Obsidian's hover preview will trigger automatically
				// because we have the correct class and attributes
				app.workspace.trigger('hover-link', {
					event: e,
					source: 'preview',
					hoverParent: container,
					targetEl: anchor,
					linktext: href,
					sourcePath: sourcePath
				});
			});
		}
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
