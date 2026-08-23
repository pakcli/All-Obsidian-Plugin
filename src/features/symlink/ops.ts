import { PathUtils, getNodeFs, getNodeChildProcess } from '../../utils/nodeHelpers';
import type { LinkType } from './types';

export type ConflictResolutionOption = 'merge-vault-to-target' | 'replace-vault-with-target';

export class SymlinkConflictError extends Error {
	linkPath: string;
	targetPath: string;
	linkItemCount: number;
	targetItemCount: number;

	constructor(linkPath: string, targetPath: string, linkItemCount: number, targetItemCount: number) {
		super(`Path already exists with ${linkItemCount} item(s): ${linkPath}`);
		this.name = 'SymlinkConflictError';
		this.linkPath = linkPath;
		this.targetPath = targetPath;
		this.linkItemCount = linkItemCount;
		this.targetItemCount = targetItemCount;
	}
}

/**
 * Check if a path on disk is a junction (Windows directory junction).
 */
function isJunction(absPath: string): boolean {
	const fs = getNodeFs();
	if (!fs) return false;
	try {
		fs.readlinkSync(absPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Ensure target folder exists or create it.
 */
async function ensureTargetFolder(p: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');
	let st: any;
	try {
		st = await fs.promises.stat(p);
	} catch {
		// Target folder does not exist yet — create it!
		await fs.promises.mkdir(p, { recursive: true });
		return;
	}
	if (!st.isDirectory()) {
		throw new Error(`Target is not a folder: ${p}`);
	}
}

/**
 * Create a junction (Windows, same-drive, no admin) or a symbolic link.
 * Automatically handles empty directories, path normalization, and conflict resolutions.
 */
export async function createLink(
	linkPath: string,
	targetPath: string,
	type: LinkType,
	resolution?: ConflictResolutionOption
): Promise<void> {
	const fs = getNodeFs();
	const cp = getNodeChildProcess();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');

	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	// Windows mklink requires standard backslashes (\) to prevent argument parsing collisions
	const normLink = isWin ? linkPath.replace(/\//g, '\\') : linkPath;
	const normTarget = isWin ? targetPath.replace(/\//g, '\\') : targetPath;

	// 1. Ensure target folder exists or create it
	await ensureTargetFolder(normTarget);

	// 2. Check if linkPath already exists on disk
	let linkStat: any = null;
	try {
		linkStat = await fs.promises.lstat(normLink);
	} catch {
		linkStat = null;
	}

	if (linkStat) {
		const isSymlink = linkStat.isSymbolicLink();
		const isJunc = isWin && linkStat.isDirectory() && isJunction(normLink);

		if (isSymlink || isJunc) {
			// Already a link pointer — safely remove old link pointer before recreating
			try {
				await removeLink(normLink);
			} catch {
				// ignore
			}
		} else if (linkStat.isDirectory()) {
			// Regular directory on disk
			const items = await fs.promises.readdir(normLink);
			if (items.length === 0) {
				// Empty directory — safe to auto-remove without error
				await fs.promises.rm(normLink, { recursive: true, force: true });
			} else {
				// Non-empty directory — conflict resolution required!
				if (!resolution) {
					let targetItems: string[] = [];
					try {
						targetItems = await fs.promises.readdir(normTarget);
					} catch {
						targetItems = [];
					}
					throw new SymlinkConflictError(normLink, normTarget, items.length, targetItems.length);
				}

				if (resolution === 'merge-vault-to-target') {
					// Merge vault directory contents into target folder
					if (typeof fs.promises.cp === 'function') {
						await fs.promises.cp(normLink, normTarget, { recursive: true });
					} else {
						// Fallback recursive copy
						await recursiveCopy(normLink, normTarget);
					}
					// Remove vault directory
					await fs.promises.rm(normLink, { recursive: true, force: true });
				} else if (resolution === 'replace-vault-with-target') {
					// Remove vault directory
					await fs.promises.rm(normLink, { recursive: true, force: true });
				}
			}
		} else {
			throw new Error(`A non-folder file already exists at: ${normLink}`);
		}
	}

	// 3. Ensure parent directory exists
	await fs.promises.mkdir(PathUtils.dirname(normLink), { recursive: true });

	// 4. Create the symlink/junction
	if (isWin && cp) {
		// mklink is a cmd.exe builtin, not a standalone exe — must run via cmd /c.
		const flag = type === 'junction' ? '/J' : '/D';
		const cmd = `cmd /c mklink ${flag} ${quote(normLink)} ${quote(normTarget)}`;
		try {
			await new Promise<void>((resolve, reject) => {
				cp.exec(cmd, { windowsHide: true }, (err: any) => {
					if (err) reject(err);
					else resolve();
				});
			});
		} catch (err: unknown) {
			throw normalizeMklinkError(err, type);
		}
		return;
	}

	// POSIX: dir/file symlink — Node infers type on Linux/macOS.
	await fs.promises.symlink(normTarget, normLink, 'dir');
}

/**
 * Fallback recursive directory copy for environments where fs.promises.cp is unavailable.
 */
async function recursiveCopy(src: string, dest: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) return;
	await fs.promises.mkdir(dest, { recursive: true });
	const entries = await fs.promises.readdir(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = PathUtils.join(src, entry.name);
		const destPath = PathUtils.join(dest, entry.name);

		if (entry.isDirectory()) {
			await recursiveCopy(srcPath, destPath);
		} else {
			await fs.promises.copyFile(srcPath, destPath);
		}
	}
}

/**
 * Remove a link pointer only. The target stays untouched.
 * On Windows a directory junction must be removed with rmdir, not unlink.
 */
export async function removeLink(linkPath: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');
	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	const normLink = isWin ? linkPath.replace(/\//g, '\\') : linkPath;

	const lst = await fs.promises.lstat(normLink);
	if (!lst.isSymbolicLink() && !(isWin && lst.isDirectory() && isJunction(normLink))) {
		throw new Error(`Not a symlink/junction: ${normLink}`);
	}

	if (isWin) {
		try {
			await fs.promises.unlink(normLink);
		} catch {
			// Junctions appear as directories to rmdir.
			await fs.promises.rmdir(normLink);
		}
		return;
	}

	await fs.promises.unlink(normLink);
}

/**
 * Copy the link's contents into the link's location, then replace the link
 * with the copied folder. Effectively: snapshot then detach.
 */
export async function copyAndDisconnect(linkPath: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');
	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	const normLink = isWin ? linkPath.replace(/\//g, '\\') : linkPath;

	const lst = await fs.promises.lstat(normLink);
	if (!lst.isSymbolicLink() && !(isWin && lst.isDirectory() && isJunction(normLink))) {
		throw new Error(`Not a symlink/junction: ${normLink}`);
	}

	const resolved = await fs.promises.realpath(normLink);
	const tmp = PathUtils.join(PathUtils.dirname(normLink), `.${PathUtils.basename(normLink)}.copying-${Date.now()}`);

	if (typeof fs.promises.cp === 'function') {
		await fs.promises.cp(resolved, tmp, { recursive: true, dereference: true });
	} else {
		await recursiveCopy(resolved, tmp);
	}

	try {
		await removeLink(normLink);
	} catch (err) {
		await safeRemove(tmp);
		throw err;
	}

	await fs.promises.rename(tmp, normLink);
}

/** Atomically repoint: remove old link and create a new one at the same path. */
export async function repointLink(
	linkPath: string,
	newTarget: string,
	type: LinkType,
	resolution?: ConflictResolutionOption
): Promise<void> {
	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	const normLink = isWin ? linkPath.replace(/\//g, '\\') : linkPath;
	const normTarget = isWin ? newTarget.replace(/\//g, '\\') : newTarget;

	await ensureTargetFolder(normTarget);
	try {
		await removeLink(normLink);
	} catch {
		// If the existing entry was already missing/broken, ignore — we'll try to create.
	}
	await createLink(normLink, normTarget, type, resolution);
}

function quote(p: string): string {
	return `"${p.replace(/"/g, '\\"')}"`;
}

async function safeRemove(p: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) return;
	try {
		await fs.promises.rm(p, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
}

function normalizeMklinkError(err: unknown, type: LinkType): Error {
	const msg = err instanceof Error ? err.message : String(err);
	if (type === 'symlink' && /privilege|elevation|denied/i.test(msg)) {
		return new Error(
			'Creating a symbolic link requires admin privileges on Windows. ' +
			'Run Obsidian as administrator, or enable Developer Mode, ' +
			'or pick a target on the same drive to use a junction instead.'
		);
	}
	return new Error(`mklink failed: ${msg}`);
}
