/**
 * PendingChangesModal.ts
 *
 * Review modal for deferred ("Remind me later") sync changes with 1-click execution.
 */
import { App, Modal, Notice, TFile } from 'obsidian';
import { SyncManager } from '../SyncManager';
import { FolderSyncSettings, PendingSyncItem } from '../types';

export class PendingChangesModal extends Modal {
    private syncManager: SyncManager;
    private getSettings: () => FolderSyncSettings;
    private saveSettings: () => Promise<void>;

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

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    render(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '⏰ Pending Script Sync Changes' });
        contentEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Review deferred changes waiting to be synchronized between your Manager notes and external CLI scripts.'
        });

        const settings = this.getSettings();
        const pending = settings.pendingChanges || [];

        if (pending.length === 0) {
            contentEl.createDiv({
                cls: 'pakcli-pending-empty',
                text: '🎉 No pending changes in queue. Everything is up to date!'
            });
            return;
        }

        // Top batch actions
        const topActions = contentEl.createDiv({ cls: 'pakcli-pending-top-actions' });
        const syncAllBtn = topActions.createEl('button', {
            cls: 'mod-cta',
            text: `⚡ Sync All (${pending.length})`
        });
        syncAllBtn.addEventListener('click', async () => {
            let successCount = 0;
            for (const item of [...pending]) {
                const file = this.app.vault.getAbstractFileByPath(item.notePath);
                if (file instanceof TFile) {
                    const ok = await this.syncManager.executeSync(file, item.direction, undefined, item.language);
                    if (ok) successCount++;
                }
            }
            new Notice(`✓ Synced ${successCount} items.`);
            this.render();
        });

        const clearAllBtn = topActions.createEl('button', {
            cls: 'mod-warning',
            text: '✕ Dismiss All'
        });
        clearAllBtn.addEventListener('click', async () => {
            settings.pendingChanges = [];
            await this.saveSettings();
            this.render();
        });

        const listContainer = contentEl.createDiv({ cls: 'pakcli-pending-list' });

        pending.forEach((item: PendingSyncItem) => {
            const row = listContainer.createDiv({ cls: 'pakcli-pending-item' });

            const info = row.createDiv({ cls: 'pakcli-pending-item-info' });
            info.createDiv({ cls: 'pakcli-pending-item-title', text: item.summary });
            info.createDiv({ cls: 'pakcli-pending-item-path', text: `${item.notePath} ⇄ ${item.cliPath}` });

            const timeStr = new Date(item.timestamp).toLocaleTimeString();
            info.createDiv({ cls: 'pakcli-pending-item-time', text: `Deferred at ${timeStr}` });

            const actions = row.createDiv({ cls: 'pakcli-pending-item-actions' });

            const execBtn = actions.createEl('button', {
                cls: 'pakcli-sync-btn pakcli-sync-btn-execute',
                text: '⚡ Sync Now'
            });
            execBtn.addEventListener('click', async () => {
                const file = this.app.vault.getAbstractFileByPath(item.notePath);
                if (file instanceof TFile) {
                    const ok = await this.syncManager.executeSync(file, item.direction, undefined, item.language);
                    if (ok) this.render();
                } else {
                    new Notice(`Note not found: ${item.notePath}`);
                }
            });

            const dismissBtn = actions.createEl('button', {
                cls: 'pakcli-sync-btn pakcli-sync-btn-ignore',
                text: 'Dismiss'
            });
            dismissBtn.addEventListener('click', async () => {
                settings.pendingChanges = settings.pendingChanges.filter(i => i.id !== item.id);
                await this.saveSettings();
                this.render();
            });
        });
    }
}
