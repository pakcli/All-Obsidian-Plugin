import { lstatSync, readlinkSync, realpathSync, statSync, Stats } from 'fs';
import { isAbsolute, resolve, dirname, parse } from 'path';
import type { LinkState, LinkType } from './types';

export function detectLink(absPath: string): LinkState {
	let lst: Stats;
	try {
		lst = lstatSync(absPath);
	} catch {
		return { kind: 'none' };
	}

	// Standard symlink (POSIX + Windows dir-symlink via mklink /D)
	if (lst.isSymbolicLink()) {
		return resolveLink(absPath, classifyLinkType(absPath));
	}

	// Windows junction — lstat reports it as a plain directory.
	// Distinguish it from a real dir by attempting readlinkSync:
	//   - real directory  → throws EINVAL ("not a reparse point")
	//   - junction        → returns the target path
	// This avoids the false-positive that realpath-comparison causes for
	// every subfolder that lives inside a junction.
	if (process.platform === 'win32' && lst.isDirectory()) {
		try {
			readlinkSync(absPath);
			return resolveLink(absPath, 'junction');
		} catch {
			return { kind: 'none' };
		}
	}

	return { kind: 'none' };
}

function resolveLink(absPath: string, type: LinkType): LinkState {
	let target = '';
	try {
		target = readlinkSync(absPath);
	} catch {
		// junction readlink can fail on some Windows configs — fall through to realpath
	}

	if (target && !isAbsolute(target)) {
		target = resolve(dirname(absPath), target);
	}

	let resolved = '';
	try {
		resolved = realpathSync(absPath);
	} catch {
		return { kind: 'broken', type, target: target || absPath };
	}

	if (!target) target = resolved;

	let targetExists = false;
	try {
		targetExists = statSync(resolved).isDirectory();
	} catch {
		targetExists = false;
	}

	return targetExists
		? { kind: 'active', type, target }
		: { kind: 'broken', type, target };
}

function classifyLinkType(absPath: string): LinkType {
	if (process.platform !== 'win32') return 'symlink';
	try {
		const link = readlinkSync(absPath);
		if (!isAbsolute(link)) return 'symlink';
		const linkDrive = parse(link).root.toLowerCase();
		const hostDrive = parse(resolve(absPath)).root.toLowerCase();
		return linkDrive === hostDrive ? 'junction' : 'symlink';
	} catch {
		return 'symlink';
	}
}

export function suggestLinkType(linkPath: string, targetPath: string): LinkType {
	if (process.platform !== 'win32') return 'symlink';
	const a = parse(resolve(linkPath)).root.toLowerCase();
	const b = parse(resolve(targetPath)).root.toLowerCase();
	return a && b && a === b ? 'junction' : 'symlink';
}
