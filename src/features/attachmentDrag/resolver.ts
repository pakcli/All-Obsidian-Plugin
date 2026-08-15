/**
 * resolver.ts - Resolves a dragged DOM element to an absolute filesystem path.
 *
 * Supported element types:
 *  - <img>                     Embedded images in Reading mode & Live Preview
 *  - .internal-embed[src]      Embedded widgets (images, PDF, video, audio, etc.)
 *  - <a class="internal-link"> Internal links to vault files
 *  - <video> / <audio>         Embedded media players
 */
import { App, TFile } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';

/** Decode an Obsidian app:// URL into an absolute OS path. */
function appUrlToAbsPath(src: string): string | null {
    if (!src) return null;
    try {
        if (src.startsWith('app://')) {
            const url = new URL(src);
            let absPath = decodeURIComponent(url.pathname);
            // Windows: /D:/folder/file -> D:/folder/file
            if (/^\/[A-Za-z]:\//.test(absPath)) absPath = absPath.slice(1);
            absPath = path.normalize(absPath);
            if (fs.existsSync(absPath)) return absPath;
        }
    } catch {}
    return null;
}

/** Resolve a vault-relative link to an absolute path via Obsidian metadata cache. */
function resolveVaultLink(rawHref: string, app: App, vaultRoot: string): string | null {
    if (!rawHref) return null;
    const withoutAnchor = rawHref.split('#')[0].split('|')[0].trim();
    if (!withoutAnchor) return null;

    const file: TFile | null = app.metadataCache.getFirstLinkpathDest(withoutAnchor, '');
    if (file) {
        const absPath = path.join(vaultRoot, ...file.path.split('/'));
        if (fs.existsSync(absPath)) return absPath;
    }

    // Direct path lookup inside vault
    const directPath = path.join(vaultRoot, ...withoutAnchor.split('/'));
    if (fs.existsSync(directPath)) return directPath;

    return null;
}

/**
 * Given the element that was clicked or dragged, return the absolute filesystem path
 * of the attachment it represents, or null if not applicable.
 */
export function resolveAttachmentAbsPath(el: HTMLElement, app: App, vaultRoot: string): string | null {
    if (!el) return null;

    // 1. Embedded widget container (.internal-embed[src])
    const embed = el.closest('.internal-embed') as HTMLElement | null;
    if (embed) {
        const src = embed.getAttribute('src') || embed.getAttribute('alt') || '';
        if (src) {
            const resolved = resolveVaultLink(src, app, vaultRoot);
            if (resolved) return resolved;
        }
    }

    // 2. <img> element
    const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img');
    if (img) {
        const src = img.getAttribute('src') || '';
        const decoded = appUrlToAbsPath(src);
        if (decoded) return decoded;

        const alt = img.getAttribute('alt') || '';
        if (alt) {
            const resolved = resolveVaultLink(alt, app, vaultRoot);
            if (resolved) return resolved;
        }
    }

    // 3. <video> or <audio>
    const media = (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')
        ? (el as HTMLVideoElement | HTMLAudioElement)
        : el.querySelector('video, audio') as HTMLVideoElement | HTMLAudioElement | null;
    if (media) {
        const src = media.currentSrc || media.getAttribute('src') || '';
        const decoded = appUrlToAbsPath(src);
        if (decoded) return decoded;
    }

    // 4. <a class="internal-link"> or child of one
    const anchor = (el.tagName === 'A' ? el : el.closest('a.internal-link')) as HTMLAnchorElement | null;
    if (anchor) {
        const href = anchor.getAttribute('data-href') || anchor.getAttribute('href') || '';
        if (href) {
            const resolved = resolveVaultLink(href, app, vaultRoot);
            if (resolved) return resolved;
        }
    }

    return null;
}

