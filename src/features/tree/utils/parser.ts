import Node, { WikiLink } from '../models/TreeNode';
import { TFolder } from 'obsidian';

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
