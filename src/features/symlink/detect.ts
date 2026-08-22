import { PathUtils, getNodeFs } from '../../utils/nodeHelpers';
import type { LinkState, LinkType } from './types';

export function detectLink(absPath: string): LinkState {
	const fs = getNodeFs();
	if (!fs) return { kind: 'none' };

	let lst: any;
	try {
		lst = fs.lstatSync(absPath);
	} catch {
		return { kind: 'none' };
	}

	// Standard symlink (POSIX + Windows dir-symlink via mklink /D)
	if (lst.isSymbolicLink()) {
		return resolveLink(absPath, classifyLinkType(absPath));
	}

	// Windows junction — lstat reports it as a plain directory.
	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	if (isWin && lst.isDirectory()) {
		try {
			fs.readlinkSync(absPath);
			return resolveLink(absPath, 'junction');
		} catch {
			return { kind: 'none' };
		}
	}

	return { kind: 'none' };
}

function resolveLink(absPath: string, type: LinkType): LinkState {
	const fs = getNodeFs();
	if (!fs) return { kind: 'none' };

	let target = '';
	try {
		target = fs.readlinkSync(absPath);
	} catch {
		// junction readlink can fail on some Windows configs — fall through to realpath
	}

	if (target && !PathUtils.isAbsolute(target)) {
		target = PathUtils.join(PathUtils.dirname(absPath), target);
	}

	let resolved = '';
	try {
		resolved = fs.realpathSync(absPath);
	} catch {
		return { kind: 'broken', type, target: target || absPath };
	}

	if (!target) target = resolved;

	let targetExists = false;
	try {
		targetExists = fs.statSync(resolved).isDirectory();
	} catch {
		targetExists = false;
	}

	return targetExists
		? { kind: 'active', type, target }
		: { kind: 'broken', type, target };
}

function classifyLinkType(absPath: string): LinkType {
	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	if (!isWin) return 'symlink';
	const fs = getNodeFs();
	if (!fs) return 'symlink';
	try {
		const link = fs.readlinkSync(absPath);
		if (!PathUtils.isAbsolute(link)) return 'symlink';
		const linkDrive = link.slice(0, 2).toLowerCase();
		const hostDrive = absPath.slice(0, 2).toLowerCase();
		return linkDrive === hostDrive ? 'junction' : 'symlink';
	} catch {
		return 'symlink';
	}
}

export function suggestLinkType(linkPath: string, targetPath: string): LinkType {
	const isWin = typeof process !== 'undefined' && process.platform === 'win32';
	if (!isWin) return 'symlink';
	const a = linkPath.slice(0, 2).toLowerCase();
	const b = targetPath.slice(0, 2).toLowerCase();
	return a && b && a === b ? 'junction' : 'symlink';
}

