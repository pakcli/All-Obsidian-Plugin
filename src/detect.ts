import * as fs from 'fs';
import * as path from 'path';
import type { LinkState, LinkType } from './types';

export function detectLink(absPath: string): LinkState {
	let lst: fs.Stats;
	try {
		lst = fs.lstatSync(absPath);
	} catch {
		return { kind: 'none' };
	}

	// POSIX symlink
	if (lst.isSymbolicLink()) {
		return resolveLink(absPath, classifyLinkType(absPath));
	}

	// Windows Junction — shows as directory, but realpath differs from absPath
	if (process.platform === 'win32' && lst.isDirectory()) {
		try {
			const real = fs.realpathSync(absPath);
			if (real.toLowerCase() !== path.resolve(absPath).toLowerCase()) {
				// realpath differs → this is a junction
				return resolveLink(absPath, 'junction');
			}
		} catch {
			return { kind: 'broken', type: 'junction', target: absPath };
		}
	}

	return { kind: 'none' };
}

function resolveLink(absPath: string, type: LinkType): LinkState {
	let target = '';
	try {
		target = fs.readlinkSync(absPath);
	} catch {
		// junction — readlink may fail on Windows, fallback to realpath
	}

	if (target && !path.isAbsolute(target)) {
		target = path.resolve(path.dirname(absPath), target);
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
	if (process.platform !== 'win32') return 'symlink';
	try {
		const link = fs.readlinkSync(absPath);
		if (!path.isAbsolute(link)) return 'symlink';
		const linkDrive = path.parse(link).root.toLowerCase();
		const hostDrive = path.parse(path.resolve(absPath)).root.toLowerCase();
		return linkDrive === hostDrive ? 'junction' : 'symlink';
	} catch {
		return 'symlink';
	}
}

export function suggestLinkType(linkPath: string, targetPath: string): LinkType {
	if (process.platform !== 'win32') return 'symlink';
	const a = path.parse(path.resolve(linkPath)).root.toLowerCase();
	const b = path.parse(path.resolve(targetPath)).root.toLowerCase();
	return a && b && a === b ? 'junction' : 'symlink';
}