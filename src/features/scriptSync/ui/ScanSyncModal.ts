/**
 * ScanSyncModal.ts
 *
 * Interactive Scan & Sync Dashboard Modal.
 * Scans all notes in the vault/folder, inspects codeblocks, matches them to target script files,
 * and allows 1-click individual and bulk synchronization.
 */
import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import * as path from 'path';
import { SyncManager } from '../SyncManager';
import { FolderSyncSettings, SyncStatusResult } from '../types';
import { extractFirstCodeBlock } from '../markdownParser';
import { renderDiffViewer } from '../diffViewer';

interface ScannedNoteItem {
    file: TFile;
    language: string;
    code: string;
    syncResult: SyncStatusResult;
}

export class ScanSyncModal extends Modal {
    private syncManager: SyncManager;
    private getSettings: () => FolderSyncSettings;
    private saveSettings: () => Promise<void>;
    private scannedItems: ScannedNoteItem[] = [];
    private isScanning = false;
    private activeDiffNotePath: string | null = null;
    private hideSynced = false;

    constructor(
        app: App,
        syncManager: SyncManager,
        getSettings: () => FolderSyncSettings,
        saveSettings: () => Promise<void>
    ) {
        super(app);
        this.syncManager = syncManager;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    async onOpen(): Promise<void> {
        this.containerEl.addClass('pakcli-scan-modal-window');
        await this.scanAndRender();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    async scanAndRender(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '⚡ Codeblock Sync Dashboard' });
        contentEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Scans all Markdown notes, extracts first codeblocks, and mirrors subfolder script files.'
        });

        const settings = this.getSettings();
        if (!settings.cliRootFolder) {
            contentEl.createDiv({
                cls: 'pakcli-pending-empty',
                text: '⚠️ Script Target Folder is not configured yet! Please set it in Settings → PakCLI Suite → Codeblock Sync.'
            });
            return;
        }

        const loadingEl = contentEl.createDiv({ cls: 'pakcli-scan-loading', text: '🔍 Scanning vault notes and script files...' });
        this.isScanning = true;

        this.scannedItems = [];
        const allFiles = this.app.vault.getMarkdownFiles();
        const managerRoot = settings.managerRootFolder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        for (const file of allFiles) {
            const normPath = file.path.replace(/\\/g, '/');
            if (managerRoot && !normPath.startsWith(managerRoot)) {
                continue;
            }

            try {
                const content = await this.app.vault.read(file);
                const extracted = extractFirstCodeBlock(content);
                if (extracted && extracted.code.trim()) {
                    const syncResult = await this.syncManager.getSyncStatus(file, extracted.code, extracted.language);
                    this.scannedItems.push({
                        file,
                        language: extracted.language,
                        code: extracted.code,
                        syncResult
                    });
                }
            } catch {}
        }

        this.isScanning = false;
        loadingEl.remove();

        this.renderDashboard();
    }

    private renderDashboard(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '⚡ Codeblock Sync Dashboard' });

        const settings = this.getSettings();
        const targetFolderDisplay = settings.cliRootFolder || '(Not set)';

        const totalCount = this.scannedItems.length;
        const needsSyncItems = this.scannedItems.filter(item => item.syncResult.status !== 'synced');
        const needsSyncCount = needsSyncItems.length;
        const syncedCount = totalCount - needsSyncCount;

        contentEl.createDiv({
            cls: 'pakcli-scan-meta-bar',
            text: `🎯 Target: ${targetFolderDisplay}  |  📝 Notes: ${totalCount}  |  ⚡ Changed: ${needsSyncCount}  |  ✓ Synced: ${syncedCount}`
        });

        if (totalCount === 0) {
            contentEl.createDiv({
                cls: 'pakcli-pending-empty',
                text: 'No notes with script codeblocks found in the configured folder.'
            });
            return;
        }

        // Top Actions Bar
        const topActions = contentEl.createDiv({ cls: 'pakcli-pending-top-actions' });

        const syncAllBtn = topActions.createEl('button', {
            cls: 'mod-cta',
            text: `⚡ Sync ${needsSyncCount > 0 ? `Changed (${needsSyncCount})` : `All (${totalCount})`}`
        });
        syncAllBtn.addEventListener('click', async () => {
            syncAllBtn.setText('⏳ Syncing...');
            syncAllBtn.setAttribute('disabled', 'true');
            const targetItems = needsSyncCount > 0 ? needsSyncItems : this.scannedItems;
            let count = 0;
            for (const item of targetItems) {
                const ok = await this.syncManager.executeSync(item.file, 'manager_to_cli', item.code, item.language);
                if (ok) count++;
            }
            new Notice(`✓ Synced ${count} script files.`);
            await this.scanAndRender();
        });

        const refreshBtn = topActions.createEl('button', {
            text: '🔄 Rescan Now'
        });
        refreshBtn.addEventListener('click', async () => {
            await this.scanAndRender();
        });

        // Hide Synced Toggle
        const toggleLabel = topActions.createEl('label', { cls: 'pakcli-scan-toggle-label' });
        const toggleCheckbox = toggleLabel.createEl('input', { type: 'checkbox' });
        toggleCheckbox.checked = this.hideSynced;
        toggleCheckbox.addEventListener('change', () => {
            this.hideSynced = toggleCheckbox.checked;
            this.renderDashboard();
        });
        toggleLabel.createSpan({ text: ` Hide Synced (${syncedCount})` });

        // Filter Displayed Items
        const displayedItems = this.hideSynced ? needsSyncItems : this.scannedItems;

        if (displayedItems.length === 0 && this.hideSynced) {
            const emptyEl = contentEl.createDiv({ cls: 'pakcli-pending-empty' });
            emptyEl.createEl('p', { text: `✨ All ${totalCount} script notes are currently synced!` });
            const showAllBtn = emptyEl.createEl('button', { text: 'Show All Notes' });
            showAllBtn.addEventListener('click', () => {
                this.hideSynced = false;
                this.renderDashboard();
            });
            return;
        }

        // Items List
        const listContainer = contentEl.createDiv({ cls: 'pakcli-scan-list-container' });

        displayedItems.forEach((item) => {
            const itemCard = listContainer.createDiv({ cls: 'pakcli-scan-item-card' });

            const row = itemCard.createDiv({ cls: 'pakcli-scan-item-row' });

            // Left Info
            const info = row.createDiv({ cls: 'pakcli-scan-item-info' });

            const titleRow = info.createDiv({ cls: 'pakcli-scan-item-title-row' });
            titleRow.createSpan({ cls: 'pakcli-scan-item-title', text: item.file.basename });

            const statusBadge = titleRow.createSpan({
                cls: `pakcli-sync-status-badge pakcli-sync-status-${item.syncResult.status}`
            });
            statusBadge.setText(this.getStatusBadgeText(item.syncResult.status));

            const langPill = titleRow.createSpan({ cls: 'pakcli-scan-lang-pill', text: item.language.toUpperCase() });

            // Path Details
            const pathsDiv = info.createDiv({ cls: 'pakcli-scan-item-paths' });
            pathsDiv.createDiv({ cls: 'pakcli-scan-path-line', text: `📝 Note: ${item.file.path}` });
            pathsDiv.createDiv({ cls: 'pakcli-scan-path-line', text: `📁 Script: ${item.syncResult.cliPath || '(None)'}` });

            // Right Actions
            const actions = row.createDiv({ cls: 'pakcli-scan-item-actions' });

            // Sync to CLI Button
            const syncBtn = actions.createEl('button', {
                cls: 'pakcli-sync-btn pakcli-sync-btn-execute',
                text: '⚡ Sync to Script'
            });
            syncBtn.addEventListener('click', async () => {
                const ok = await this.syncManager.executeSync(item.file, 'manager_to_cli', item.code, item.language);
                if (ok) await this.scanAndRender();
            });

            // Pull CLI Button (if CLI script exists on disk)
            if (item.syncResult.cliCode) {
                const pullBtn = actions.createEl('button', {
                    cls: 'pakcli-sync-btn',
                    text: '📥 Pull from Script'
                });
                pullBtn.addEventListener('click', async () => {
                    const ok = await this.syncManager.executeSync(item.file, 'cli_to_manager', undefined, item.language);
                    if (ok) await this.scanAndRender();
                });
            }

            // Diff Button
            if (item.syncResult.cliCode && item.syncResult.status !== 'synced') {
                const isDiffActive = this.activeDiffNotePath === item.file.path;
                const diffBtn = actions.createEl('button', {
                    cls: `pakcli-sync-btn ${isDiffActive ? 'active' : ''}`,
                    text: isDiffActive ? '👁️ Hide Diff' : '👁️ Diff'
                });
                diffBtn.addEventListener('click', () => {
                    this.activeDiffNotePath = isDiffActive ? null : item.file.path;
                    this.renderDashboard();
                });
            }

            // Diff Viewer Accordion
            if (this.activeDiffNotePath === item.file.path && item.syncResult.cliCode) {
                const diffEl = itemCard.createDiv({ cls: 'pakcli-sync-diff-container' });
                renderDiffViewer(diffEl, item.syncResult.cliCode, item.code);
            }
        });
    }

    private getStatusBadgeText(status?: string): string {
        switch (status) {
            case 'synced': return '✓ Synced';
            case 'manager_modified': return '⚡ Note Modified';
            case 'cli_modified': return '📥 Script Modified';
            case 'conflict': return '⚠️ Conflict';
            case 'cli_missing': return '📄 Not Created Yet';
            case 'not_mapped': return '⚙️ Unmapped';
            default: return '● Pending';
        }
    }
}
