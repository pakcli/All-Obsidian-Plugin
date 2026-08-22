import { Platform } from 'obsidian';

/**
 * Pure JavaScript path utility functions that work cross-platform
 * (Mobile Android/iOS, Web, Desktop) without importing Node.js 'path'.
 */
export const PathUtils = {
	join(...parts: string[]): string {
		return parts
			.map((part, index) => {
				if (index === 0) {
					return part.trim().replace(/[\/\\]+$/, '');
				}
				return part.trim().replace(/^[\/\\]+|[\/\\]+$/g, '');
			})
			.filter(part => part.length > 0)
			.join('/');
	},

	dirname(pathStr: string): string {
		const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '');
		const lastSlash = normalized.lastIndexOf('/');
		if (lastSlash === -1) return '.';
		if (lastSlash === 0) return '/';
		return normalized.slice(0, lastSlash);
	},

	basename(pathStr: string, ext?: string): string {
		const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '');
		const lastSlash = normalized.lastIndexOf('/');
		let base = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
		if (ext && base.endsWith(ext)) {
			base = base.slice(0, -ext.length);
		}
		return base;
	},

	isAbsolute(pathStr: string): boolean {
		if (/^[a-zA-Z]:[\\\/]/.test(pathStr)) return true; // Windows drive letter
		if (pathStr.startsWith('/') || pathStr.startsWith('\\\\')) return true; // POSIX or UNC
		return false;
	},

	extname(pathStr: string): string {
		const base = this.basename(pathStr);
		const lastDot = base.lastIndexOf('.');
		if (lastDot <= 0) return '';
		return base.slice(lastDot);
	},

	relative(from: string, to: string): string {
		const normFrom = from.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
		const normTo = to.replace(/\\/g, '/').toLowerCase();
		if (normTo.startsWith(normFrom)) {
			const rel = to.slice(normFrom.length);
			return rel.replace(/^[\/\\]+/, '');
		}
		return to;
	},

	normalize(pathStr: string): string {
		return pathStr.replace(/\\/g, '/');
	}
};

/**
 * Safely access Node.js 'fs' module if available (Desktop only).
 */
export function getNodeFs(): any {
	if (!Platform.isDesktop) return null;
	try {
		const win = typeof window !== 'undefined' ? (window as any) : undefined;
		if (win?.require) {
			return win.require('fs');
		}
	} catch {
		// Ignore on environments without Node
	}
	return null;
}

/**
 * Safely access Node.js 'child_process' module if available (Desktop only).
 */
export function getNodeChildProcess(): any {
	if (!Platform.isDesktop) return null;
	try {
		const win = typeof window !== 'undefined' ? (window as any) : undefined;
		if (win?.require) {
			return win.require('child_process');
		}
	} catch {
		// Ignore on environments without Node
	}
	return null;
}

/**
 * Safely access Node.js 'os' module if available (Desktop only).
 */
export function getNodeOs(): any {
	if (!Platform.isDesktop) return null;
	try {
		const win = typeof window !== 'undefined' ? (window as any) : undefined;
		if (win?.require) {
			return win.require('os');
		}
	} catch {
		// Ignore on environments without Node
	}
	return null;
}

/**
 * Safely access Node.js 'path' module if available. Falls back to pure JS PathUtils.
 */
export function getNodePath(): any {
	try {
		const win = typeof window !== 'undefined' ? (window as any) : undefined;
		if (win?.require) {
			return win.require('path');
		}
	} catch {
		// Fall back to PathUtils
	}
	return PathUtils;
}

/**
 * Safely access Electron module if available.
 */
export function getElectron(): any {
	if (!Platform.isDesktop) return null;
	try {
		const win = typeof window !== 'undefined' ? (window as any) : undefined;
		if (win?.require) {
			return win.require('electron');
		}
	} catch {
		// Ignore
	}
	return null;
}
