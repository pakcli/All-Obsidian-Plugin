import { PathUtils, getNodeFs, getNodeChildProcess } from '../../utils/nodeHelpers';
import type { LinkType } from './types';

/**
 * Create a junction (Windows, same-drive, no admin) or a symbolic link.
 * The link path's parent must exist; the link path itself must NOT exist.
 */
export async function createLink(linkPath: string, targetPath: string, type: LinkType): Promise<void> {
	const fs = getNodeFs();
	const cp = getNodeChildProcess();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');

	await assertPathFree(linkPath);
	await assertTargetExists(targetPath);
	await fs.promises.mkdir(PathUtils.dirname(linkPath), { recursive: true });

	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	if (isWin && cp) {
		// mklink is a cmd.exe builtin, not a standalone exe — must run via cmd /c.
		const flag = type === 'junction' ? '/J' : '/D';
		const cmd = `cmd /c mklink ${flag} ${quote(linkPath)} ${quote(targetPath)}`;
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
	await fs.promises.symlink(targetPath, linkPath, 'dir');
}

/**
 * Remove a link pointer only. The target stays untouched.
 * On Windows a directory junction must be removed with rmdir, not unlink.
 */
export async function removeLink(linkPath: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');
	const lst = await fs.promises.lstat(linkPath);
	if (!lst.isSymbolicLink()) {
		throw new Error(`Not a symlink/junction: ${linkPath}`);
	}

	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	if (isWin) {
		try {
			await fs.promises.unlink(linkPath);
		} catch {
			// Junctions appear as directories to rmdir.
			await fs.promises.rmdir(linkPath);
		}
		return;
	}

	await fs.promises.unlink(linkPath);
}

/**
 * Copy the link's contents into the link's location, then replace the link
 * with the copied folder. Effectively: snapshot then detach.
 */
export async function copyAndDisconnect(linkPath: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');
	const lst = await fs.promises.lstat(linkPath);
	if (!lst.isSymbolicLink()) {
		throw new Error(`Not a symlink/junction: ${linkPath}`);
	}

	const resolved = await fs.promises.realpath(linkPath);
	const tmp = PathUtils.join(PathUtils.dirname(linkPath), `.${PathUtils.basename(linkPath)}.copying-${Date.now()}`);

	await fs.promises.cp(resolved, tmp, { recursive: true, dereference: true });

	try {
		await removeLink(linkPath);
	} catch (err) {
		await safeRemove(tmp);
		throw err;
	}

	await fs.promises.rename(tmp, linkPath);
}

/** Atomically repoint: remove old link and create a new one at the same path. */
export async function repointLink(linkPath: string, newTarget: string, type: LinkType): Promise<void> {
	await assertTargetExists(newTarget);
	try {
		await removeLink(linkPath);
	} catch {
		// If the existing entry was already missing/broken, ignore — we'll try to create.
	}
	await createLink(linkPath, newTarget, type);
}

function quote(p: string): string {
	return `"${p.replace(/"/g, '\\"')}"`;
}

async function assertPathFree(p: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) return;
	try {
		await fs.promises.lstat(p);
	} catch {
		return;
	}
	throw new Error(`Path already exists: ${p}`);
}

async function assertTargetExists(p: string): Promise<void> {
	const fs = getNodeFs();
	if (!fs) throw new Error('Filesystem operations are only available on desktop platforms.');
	let st: any;
	try {
		st = await fs.promises.stat(p);
	} catch {
		throw new Error(`Target does not exist: ${p}`);
	}
	if (!st.isDirectory()) {
		throw new Error(`Target is not a folder: ${p}`);
	}
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
