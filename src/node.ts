export default class Node {
	name: string;
	depth: number;
	parent: Node | null;
	children: Node[];
	isLast: boolean;

	constructor(name: string, depth: number, parent = null, isLast = false) {
		this.name = name;
		this.depth = depth;
		this.parent = parent;
		this.children = [];
		this.isLast = isLast;
	}

	addChild(child: Node) {
		if (this.children.length > 0)
			this.children[this.children.length - 1].isLast = false;
		this.children.push(child);
		child.setIsLast(true);
		child.setParent(this);
		child.setDepth(this.depth + 1);
	}

	setParent(p: Node) {
		this.parent = p;
	}

	setIsLast(v: boolean) {
		this.isLast = v;
	}

	setDepth(d: number) {
		this.depth = d;
	}
}