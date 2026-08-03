export type LinkType = 'junction' | 'symlink';

export type LinkState =
	| { kind: 'none' }
	| { kind: 'active'; type: LinkType; target: string }
	| { kind: 'broken'; type: LinkType; target: string };

export interface LinkInfo {
	/** Absolute filesystem path to the folder inside the vault. */
	absPath: string;
	/** Path relative to vault root, using forward slashes. */
	vaultPath: string;
	/** Current detected state. */
	state: LinkState;
}
