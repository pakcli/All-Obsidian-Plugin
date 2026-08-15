/**
 * AttachmentDragHandler.ts
 *
 * Makes attachments inside Obsidian notes (images, PDFs, videos, audio, file links)
 * directly draggable as native file objects into OS-level drop targets:
 *   - Browser upload dropzones (Gmail, Google Drive, Notion, Figma, ...)
 *   - Desktop chat & productivity apps (Slack, Discord, VS Code, ...)
 *   - OS file managers (File Explorer, Desktop, Finder)
 */
import { App, Plugin } from 'obsidian';
import * as path from 'path';
import { resolveAttachmentAbsPath } from './resolver';

export class AttachmentDragHandler {
    private readonly app: App;
    private readonly vaultRoot: string;

    constructor(app: App, vaultRoot: string) {
        this.app = app;
        this.vaultRoot = vaultRoot;
    }

    /** Register event listeners for both pointer activation and native drag payload. */
    register(plugin: Plugin): void {
        // 1. Ensure elements in Live Preview / Reading mode are recognized as draggable
        plugin.registerDomEvent(
            document,
            'mousedown',
            (e: MouseEvent) => this.onMouseDown(e),
            { capture: true }
        );

        // 2. Intercept dragstart and attach native file transfer payload
        plugin.registerDomEvent(
            document,
            'dragstart',
            (e: DragEvent) => this.onDragStart(e),
            { capture: true }
        );
    }

    private onMouseDown(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Check if clicked element or parent is an attachment
        const embed = target.closest('.internal-embed, img, video, audio, a.internal-link') as HTMLElement | null;
        if (embed) {
            embed.setAttribute('draggable', 'true');
            if (target !== embed) {
                target.setAttribute('draggable', 'true');
            }
        }
    }

    private onDragStart(e: DragEvent): void {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        const absPath = resolveAttachmentAbsPath(target, this.app, this.vaultRoot);
        if (!absPath) return;

        const fileName = path.basename(absPath);
        const normalizedPath = absPath.replace(/\\/g, '/');
        const fileUrl = normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`;

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'copyMove';

            // 1. Standard Chromium native file download/drop payload (works for Desktop / Explorer)
            try {
                e.dataTransfer.setData('DownloadURL', `application/octet-stream:${fileName}:${fileUrl}`);
            } catch {}

            // 2. URI and Plain text payloads for browser/web drop targets (Gmail, Drive, Slack)
            try {
                e.dataTransfer.setData('text/uri-list', fileUrl);
                e.dataTransfer.setData('text/plain', fileUrl);
            } catch {}
        }

        // 3. Electron native webContents startDrag (hands off OS-level file drag)
        try {
            const win = window as unknown as { require?: (mod: string) => Record<string, unknown> };
            if (typeof win.require === 'function') {
                const electron = win.require('electron') as {
                    remote?: {
                        getCurrentWebContents?: () => { startDrag: (opts: { file: string; icon: string }) => void };
                    };
                    webContents?: {
                        getFocusedWebContents?: () => { startDrag: (opts: { file: string; icon: string }) => void };
                    };
                };

                let webContents = electron?.remote?.getCurrentWebContents?.();
                if (!webContents) {
                    try {
                        const remote = win.require('@electron/remote') as {
                            getCurrentWebContents?: () => { startDrag: (opts: { file: string; icon: string }) => void };
                        };
                        webContents = remote?.getCurrentWebContents?.();
                    } catch {}
                }

                if (webContents && typeof webContents.startDrag === 'function') {
                    webContents.startDrag({
                        file: absPath,
                        icon: ''
                    });
                }
            }
        } catch {}
    }
}

