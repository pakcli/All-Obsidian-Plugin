/**
 * AttachmentDragHandler.ts
 *
 * Makes attachments inside Obsidian notes (images, PDFs, videos, audio, file links)
 * directly draggable as native file objects into OS-level drop targets:
 *   - AI web chats (ChatGPT, Claude, Gemini, ...)
 *   - Browser upload dropzones (Gmail, Google Drive, Notion, Figma, ...)
 *   - Desktop chat & productivity apps (Slack, Discord, VS Code, ...)
 *   - OS file managers (File Explorer, Desktop, Finder)
 *
 * Also adds right-click context menu "Copy Image for Claude / ChatGPT"
 * for instant 1-click clipboard paste.
 */
import { App, Menu, Notice, Plugin, TFile } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import { resolveAttachment } from './resolver';

/** Copy image binary or file to system clipboard for instant paste into Claude / ChatGPT. */
export async function copyAttachmentToClipboard(absPath: string): Promise<boolean> {
    try {
        const win = window as unknown as { require?: (m: string) => { clipboard?: { writeImage: (img: unknown) => void; write: (data: unknown) => void }; nativeImage?: { createFromPath: (p: string) => { isEmpty: () => boolean } } } };
        const electron = win.require ? win.require('electron') : null;
        if (electron?.clipboard && electron?.nativeImage) {
            const ext = path.extname(absPath).toLowerCase().slice(1);
            if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) {
                const img = electron.nativeImage.createFromPath(absPath);
                if (img && !img.isEmpty()) {
                    electron.clipboard.writeImage(img);
                    return true;
                }
            }
        }
    } catch {
        // Ignore electron clipboard failure
    }

    try {
        const ext = path.extname(absPath).toLowerCase().slice(1);
        const mime = (ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png');
        const buffer = await fs.promises.readFile(absPath);
        const blob = new Blob([buffer], { type: mime });
        await navigator.clipboard.write([
            new ClipboardItem({ [mime]: blob })
        ]);
        return true;
    } catch {
        // Ignore fallback clipboard failure
    }

    return false;
}

export class AttachmentDragHandler {
    private readonly app: App;
    private readonly vaultRoot: string;

    constructor(app: App, vaultRoot: string) {
        this.app = app;
        this.vaultRoot = vaultRoot;
    }

    /** Register event listeners for pointer activation, native drag payload, and context menu. */
    register(plugin: Plugin): void {
        // 1. Mark attachment widgets in Live Preview & Reading mode as draggable on mousedown
        plugin.registerDomEvent(
            document,
            'mousedown',
            (e: MouseEvent) => this.onMouseDown(e),
            { capture: true }
        );

        // 2. Intercept dragstart and attach native file transfer payload & Electron startDrag
        plugin.registerDomEvent(
            document,
            'dragstart',
            (e: DragEvent) => this.onDragStart(e),
            { capture: true }
        );

        // 3. Right-click context menu on images and attachments for instant clipboard copy to Claude / ChatGPT
        plugin.registerDomEvent(
            document,
            'contextmenu',
            (e: MouseEvent) => this.onContextMenu(e),
            { capture: true }
        );
    }

    private onMouseDown(e: MouseEvent): void {
        const target = e.target instanceof HTMLElement ? e.target : null;
        if (!target) return;

        const attachmentEl = target.closest<HTMLElement>(
            '.internal-embed, .cm-embed-block, img, video, audio, a.internal-link'
        );

        if (attachmentEl) {
            attachmentEl.setAttribute('draggable', 'true');
            attachmentEl.setAttribute('contenteditable', 'false');
            if (target !== attachmentEl) {
                target.setAttribute('draggable', 'true');
            }
            const cmBlock = target.closest<HTMLElement>('.cm-embed-block');
            if (cmBlock) {
                cmBlock.setAttribute('draggable', 'true');
                cmBlock.setAttribute('contenteditable', 'false');
            }
        }
    }

    private onDragStart(e: DragEvent): void {
        const target = e.target instanceof HTMLElement ? e.target : null;
        if (!target) return;

        const resolved = resolveAttachment(target, this.app, this.vaultRoot);
        if (!resolved) return;

        const { file, absPath } = resolved;
        const fileName = path.basename(absPath);
        const normalizedPath = absPath.replace(/\\/g, '/');
        const fileUrl = normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`;

        // 1. Use Obsidian's internal dragManager
        const dragManager = (this.app as unknown as {
            dragManager?: {
                dragFile?: (e: DragEvent, f: TFile) => unknown;
                dragFiles?: (e: DragEvent, f: TFile[]) => unknown;
                onDragStart?: (e: DragEvent, data: unknown) => void;
            };
        }).dragManager;

        if (file && dragManager) {
            try {
                if (typeof dragManager.dragFiles === 'function') {
                    const dragData = dragManager.dragFiles(e, [file]);
                    if (typeof dragManager.onDragStart === 'function' && dragData) {
                        dragManager.onDragStart(e, dragData);
                    }
                } else if (typeof dragManager.dragFile === 'function') {
                    const dragData = dragManager.dragFile(e, file);
                    if (typeof dragManager.onDragStart === 'function' && dragData) {
                        dragManager.onDragStart(e, dragData);
                    }
                }
            } catch (err) {
                console.debug('[Asset Draggable] dragManager error:', err);
            }
        }

        // 2. Electron native webContents.startDrag (Hands off OS-level file handle to Chrome / Claude / ChatGPT)
        try {
            const win = window as unknown as {
                require?: (m: string) => {
                    remote?: {
                        getCurrentWebContents?: () => { startDrag: (opts: { file?: string; files?: string[]; icon: unknown }) => void };
                        getCurrentWindow?: () => { webContents?: { startDrag: (opts: { file?: string; files?: string[]; icon: unknown }) => void } };
                    };
                    nativeImage?: {
                        createFromPath: (p: string) => { isEmpty: () => boolean };
                        createFromDataURL: (u: string) => unknown;
                    };
                };
            };

            const electron = win.require ? win.require('electron') : null;
            const remote = win.require
                ? ((win.require('@electron/remote') as typeof electron.remote) || electron?.remote)
                : electron?.remote;

            const webContents = remote?.getCurrentWebContents?.() || remote?.getCurrentWindow?.()?.webContents;

            let icon: unknown = '';
            if (electron?.nativeImage) {
                try {
                    const img = electron.nativeImage.createFromPath(absPath);
                    if (img && !img.isEmpty()) {
                        icon = img;
                    } else {
                        const transparentPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
                        icon = electron.nativeImage.createFromDataURL(transparentPng);
                    }
                } catch {
                    // Ignore nativeImage creation failure
                }
            }

            if (webContents && typeof webContents.startDrag === 'function') {
                webContents.startDrag({
                    file: absPath,
                    files: [absPath],
                    icon: icon
                });
            }
        } catch (err) {
            console.debug('[Asset Draggable] Electron startDrag error:', err);
        }

        // 3. Set comprehensive Chromium & Web dataTransfer payloads (for Claude, ChatGPT, Google Drive, Gmail, etc.)
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'all';

            // Specific MIME mapping for image/media uploads
            const ext = path.extname(fileName).toLowerCase().slice(1);
            const mimeMap: Record<string, string> = {
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                svg: 'image/svg+xml',
                webp: 'image/webp',
                pdf: 'application/pdf',
                mp4: 'video/mp4',
                mp3: 'audio/mpeg',
                wav: 'audio/wav',
                zip: 'application/zip'
            };
            const mime = mimeMap[ext] || 'application/octet-stream';

            // DownloadURL format for Windows Explorer, Finder, and Chromium browser drops (Claude/ChatGPT/Drive)
            try {
                e.dataTransfer.setData('DownloadURL', `${mime}:${fileName}:${fileUrl}`);
            } catch {
                // Ignore dataTransfer failure
            }

            // Standard URI, plain text, and HTML representations
            try {
                e.dataTransfer.setData('text/uri-list', fileUrl);
                e.dataTransfer.setData('text/plain', fileUrl);
                e.dataTransfer.setData('text/html', `<img src="${fileUrl}" alt="${fileName}">`);
            } catch {
                // Ignore dataTransfer failure
            }
        }
    }

    private onContextMenu(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Only show custom context menu if right-clicking an actual image or attachment embed
        const isEmbed = target.closest('.internal-embed, img, video, audio');
        if (!isEmbed) return;

        const resolved = resolveAttachment(target, this.app, this.vaultRoot);
        if (!resolved) return;

        const { absPath } = resolved;
        const fileName = path.basename(absPath);

        const menu = new Menu();
        menu.addItem((item) =>
            item
                .setTitle(`Copy Image for Claude / ChatGPT (${fileName})`)
                .setIcon('copy')
                .onClick(async () => {
                    const success = await copyAttachmentToClipboard(absPath);
                    if (success) {
                        new Notice(`Copied "${fileName}"! Press Ctrl+V in Claude or ChatGPT to paste.`);
                    } else {
                        new Notice(`Failed to copy "${fileName}" to clipboard.`);
                    }
                })
        );

        menu.addItem((item) =>
            item
                .setTitle('Copy File Path')
                .setIcon('link')
                .onClick(() => {
                    navigator.clipboard.writeText(absPath);
                    new Notice(`Copied path: ${absPath}`);
                })
        );

        menu.showAtMouseEvent(e);
    }
}
