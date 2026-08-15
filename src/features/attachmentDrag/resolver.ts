/**
 * resolver.ts - Resolves a dragged DOM element to a TFile and an absolute filesystem path.
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

export interface ResolvedAttachment {
    file: TFile | null;
    absPath: string;
}

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

/**
 * Given an element clicked or dragged, return both the Obsidian TFile (if inside vault)
 * and the absolute filesystem path on disk.
 */
export function resolveAttachment(el: HTMLElement, app: App, vaultRoot: string): ResolvedAttachment | null {
    if (!el) return null;

    const activeFile = app.workspace.getActiveFile();
    const sourcePath = activeFile ? activeFile.path : '';

    const tryResolveLink = (linkText: string): ResolvedAttachment | null => {
        if (!linkText) return null;
        const clean = linkText.split('#')[0].split('|')[0].trim();
        if (!clean) return null;

        const file = app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
        if (file instanceof TFile) {
            const absPath = path.join(vaultRoot, ...file.path.split('/'));
            if (fs.existsSync(absPath)) {
                return { file, absPath };
            }
        }

        const directAbstract = app.vault.getAbstractFileByPath(clean);
        if (directAbstract instanceof TFile) {
            const absPath = path.join(vaultRoot, ...directAbstract.path.split('/'));
            if (fs.existsSync(absPath)) {
                return { file: directAbstract, absPath };
            }
        }

        const directPath = path.join(vaultRoot, ...clean.split('/'));
        if (fs.existsSync(directPath)) {
            return { file: null, absPath: directPath };
        }

        return null;
    };

    // 1. Embedded widget container (.internal-embed)
    const embed = el.closest('.internal-embed') as HTMLElement | null;
    if (embed) {
        const src = embed.getAttribute('src') || embed.getAttribute('alt') || '';
        if (src) {
            const res = tryResolveLink(src);
            if (res) return res;
        }
    }

    // 2. <img> element
    const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img');
    if (img) {
        const src = img.getAttribute('src') || '';
        const decoded = appUrlToAbsPath(src);
        if (decoded) {
            const rel = path.relative(vaultRoot, decoded).replace(/\\/g, '/');
            const file = app.vault.getAbstractFileByPath(rel);
            return {
                file: file instanceof TFile ? file : null,
                absPath: decoded
            };
        }

        const alt = img.getAttribute('alt') || '';
        if (alt) {
            const res = tryResolveLink(alt);
            if (res) return res;
        }
    }

    // 3. <video> or <audio>
    const media = (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')
        ? (el as HTMLVideoElement | HTMLAudioElement)
        : el.querySelector('video, audio') as HTMLVideoElement | HTMLAudioElement | null;
    if (media) {
        const src = media.currentSrc || media.getAttribute('src') || '';
        const decoded = appUrlToAbsPath(src);
        if (decoded) {
            const rel = path.relative(vaultRoot, decoded).replace(/\\/g, '/');
            const file = app.vault.getAbstractFileByPath(rel);
            return {
                file: file instanceof TFile ? file : null,
                absPath: decoded
            };
        }
    }

    // 4. <a class="internal-link">
    const anchor = (el.tagName === 'A' ? el : el.closest('a.internal-link')) as HTMLAnchorElement | null;
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


