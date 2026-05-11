import Node from './node';

const EDGE = "├── ";
const CORNER = "└── ";
const LINE = "│   ";
const BLANK = "    ";


interface parseLineOutput {
    depth: number;
    name: string;
}

/**
 * Parse a line of input text to Node properties.
 * @param text A line of input
 * @returns parseLineOutput Parsed Node properties
 */
function parseLine(text: string): parseLineOutput {
    let depth = 0;
    let index = 0;
    let name = "";

    while (text.charAt(index) === "\t") {
        depth++;
        index++;
    }
    name = text.substring(index);

    return {
        depth,
        name
    };
}

/**
 * Parse input text into a hierarchy of Nodes.
 * @param source Input
 * @returns The root node of the tree, or null if source is empty
 */
export function parseInput(source: string): Node | null {
    let lines: string[] = source.trim().split("\n");

    if (lines.length == 0)
        return null;

    let root: Node;
    let lastNode: Node;

    let { depth, name } = parseLine(lines[0]);
    root = new Node(name, 0, null, true);
    lastNode = root;

    for (let i = 1; i < lines.length; i++) {
        let { depth, name } = parseLine(lines[i]);
        if (depth == 0) {
            // ignore extra root nodes
            continue;
        }

        let node = new Node(name, depth);

        if (node.depth === lastNode.depth) {
            lastNode.parent?.addChild(node);
        } else if (node.depth > lastNode.depth) {
            lastNode.addChild(node);
        } else {
            let diff = lastNode.depth - node.depth;
            let parent: Node | null = lastNode.parent;

            if (parent == null)
                throw Error("parent is null!");

            while (diff > 0) {
                parent = parent.parent;
                if (parent == null)
                    throw Error("parent is null!");

                diff--;
            }
            parent.addChild(node);
        }

        lastNode = node;
    }

    return root;
}

/**
 * Parse a hierarchy of Nodes into corresponding text to display in tree diagram.
 * 
 * @param root The root node
 * @returns An array of lines to display in the tree diagram,
 *          each line corresponds to a Node
 */
export function treeView(root: Node): string[] {
    let output: string[] = [];
    let queue: Node[] = [...root.children];

    output.push(root.name);

    while (queue.length > 0) {
        let node = queue.shift();
        if (node === undefined) {
            throw Error("node is undefined!");
        }

        queue = [...node.children, ...queue]

        let line = "";
        let n = node.parent;
        while (n) {
            if (n === root)
                break;
            if (n.isLast === true) {
                line = BLANK + line;
            } else {
                line = LINE + line;
            }
            n = n.parent;
        }
        line = line.concat(node.isLast ? CORNER : EDGE);
        line = line.concat(node.name);

        output.push(line);
    }

    return output;
}
