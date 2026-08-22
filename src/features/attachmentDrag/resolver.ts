/**
 * resolver.ts - Resolves a dragged DOM element to a TFile and an absolute filesystem path.
 *
 * Fully compatible with macOS, iPadOS, iOS, Windows, and Linux.
 *
 * Supported element types:
 *  - <img>                     Embedded images in Reading mode & Live Preview
 *  - .internal-embed[src]      Embedded widgets (images, PDF, video, audio, etc.)
 *  - <a class="internal-link"> Internal links to vault files
 *  - <video> / <audio>         Embedded media players
 */
import { App, TFile } from 'obsidian';
import { PathUtils, getNodeFs } from '../../utils/nodeHelpers';

export interface ResolvedAttachment {
    file: TFile | null;
    absPath: string;
}

/** Decode an Obsidian app:// or mobile protocol URL into an absolute OS path or vault file. */
function appUrlToResolved(src: string, app: App, vaultRoot: string): ResolvedAttachment | null {
    if (!src) return null;
    try {
        if (
            src.startsWith('app://') ||
            src.startsWith('capacitor://') ||
            src.startsWith('http://localhost') ||
            src.startsWith('obsidian://')
        ) {
            const url = new URL(src);
            let decoded = decodeURIComponent(url.pathname);
            // Windows drive letters: /D:/folder/file -> D:/folder/file
            if (/^\/[A-Za-z]:\//.test(decoded)) decoded = decoded.slice(1);
            decoded = PathUtils.normalize(decoded);

            // 1. If decoded path matches vaultRoot on desktop
            if (vaultRoot && decoded.toLowerCase().startsWith(vaultRoot.toLowerCase())) {
                const rel = PathUtils.relative(vaultRoot, decoded).replace(/\\/g, '/');
                const file = app.vault.getAbstractFileByPath(rel);
                return {
                    file: file instanceof TFile ? file : null,
                    absPath: decoded
                };
            }

            // 2. Direct vault path match (for iPadOS/iOS/Web)
            const cleanPath = decoded.replace(/^\/+/, '');
            const directFile = app.vault.getAbstractFileByPath(cleanPath);
            if (directFile instanceof TFile) {
                return {
                    file: directFile,
                    absPath: vaultRoot ? PathUtils.join(vaultRoot, directFile.path) : directFile.path
                };
            }

            // 3. Search vault files by filename match
            const filename = PathUtils.basename(decoded);
            const found = app.vault.getFiles().find((f) => f.name === filename);
            if (found) {
                return {
                    file: found,
                    absPath: vaultRoot ? PathUtils.join(vaultRoot, found.path) : found.path
                };
            }

            const fs = getNodeFs();
            if (fs && fs.existsSync(decoded)) {
                return { file: null, absPath: decoded };
            }

            return { file: null, absPath: decoded };
        }
    } catch {
        // Ignore URL parsing errors
    }
    return null;
}

/**
 * Given an element clicked or dragged, return both the Obsidian TFile (if inside vault)
 * and the filesystem path on disk.
 */
export function resolveAttachment(el: HTMLElement, app: App, vaultRoot: string): ResolvedAttachment | null {
    if (!el) return null;

    const activeFile = app.workspace.getActiveFile();
    const sourcePath = activeFile ? activeFile.path : '';

    const tryResolveLink = (linkText: string): ResolvedAttachment | null => {
        if (!linkText) return null;
        const clean = linkText.split('#')[0].split('|')[0].trim();
        if (!clean) return null;

        const fs = getNodeFs();
        const file = app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
        if (file instanceof TFile) {
            const absPath = vaultRoot ? PathUtils.join(vaultRoot, ...file.path.split('/')) : file.path;
            if (!fs || fs.existsSync(absPath)) {
                return { file, absPath };
            }
            return { file, absPath };
        }

        const directAbstract = app.vault.getAbstractFileByPath(clean);
        if (directAbstract instanceof TFile) {
            const absPath = vaultRoot ? PathUtils.join(vaultRoot, ...directAbstract.path.split('/')) : directAbstract.path;
            if (!fs || fs.existsSync(absPath)) {
                return { file: directAbstract, absPath };
            }
            return { file: directAbstract, absPath };
        }

        if (vaultRoot) {
            const directPath = PathUtils.join(vaultRoot, ...clean.split('/'));
            if (!fs || fs.existsSync(directPath)) {
                return { file: null, absPath: directPath };
            }
        }

        return null;
    };

    // 1. Embedded widget container (.internal-embed)
    const embed = el.closest<HTMLElement>('.internal-embed');
    if (embed) {
        const src = embed.getAttribute('src') || embed.getAttribute('alt') || '';
        if (src) {
            const res = tryResolveLink(src);
            if (res) return res;
        }
    }

    // 2. <img> element
    const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
    if (img) {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        const resolved = appUrlToResolved(src, app, vaultRoot);
        if (resolved) return resolved;

        const alt = img.getAttribute('alt') || '';
        if (alt) {
            const res = tryResolveLink(alt);
            if (res) return res;
        }
    }

    // 3. <video> or <audio>
    const media = (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement)
        ? el
        : el.querySelector<HTMLVideoElement | HTMLAudioElement>('video, audio');
    if (media) {
        const src = media.currentSrc || media.getAttribute('src') || '';
        const resolved = appUrlToResolved(src, app, vaultRoot);
        if (resolved) return resolved;
    }

    // 4. <a class="internal-link">
    const anchor = el instanceof HTMLAnchorElement ? el : el.closest<HTMLAnchorElement>('a.internal-link');
    if (anchor) {
        const href = anchor.getAttribute('data-href') || anchor.getAttribute('href') || '';
        if (href) {
            const res = tryResolveLink(href);
            if (res) return res;
        }
    }

    return null;
}

export function resolveAttachmentAbsPath(el: HTMLElement, app: App, vaultRoot: string): string | null {
    const res = resolveAttachment(el, app, vaultRoot);
    return res ? res.absPath : null;
}
