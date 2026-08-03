import TreeNode from '../models/TreeNode';

const EDGE = "├── ";
const CORNER = "└── ";
const LINE = "│   ";
const BLANK = "    ";

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
    root: TreeNode, 
    interactive: boolean = false, 
    expandedNodes: Set<string> = new Set(), 
    nodePath: string = "",
    levelNumbered: number = 0,
    numberPrefix: string = "",
    startShowLevel: number = 999,
    levelNumberOffset: number = 0
): string[] {
    let output: string[] = [];
    let queue: Array<{ node: TreeNode; path: string; depth: number; numberParts: number[] }> = [];

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
            const childQueue: Array<{ node: TreeNode; path: string; depth: number; numberParts: number[] }> = [];
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
