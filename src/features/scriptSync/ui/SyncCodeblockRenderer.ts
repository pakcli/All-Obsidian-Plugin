/**
 * SyncCodeblockRenderer.ts
 *
 * Renders the Two-Section Codeblock:
 *   - Section 1: Interactive Sync Controller, Diff Viewer & Script Runner
 *   - Section 2: Formatted Codeblock with Copy Button & Scaler Integration
 */
import { FileSystemAdapter, MarkdownRenderChild, Notice, TFile } from 'obsidian';
import * as path from 'path';
import { SyncManager } from '../SyncManager';
import { renderDiffViewer } from '../diffViewer';
import { renderAsciiSvg } from '../../codeblock/scaler';

export class SyncCodeblockRenderer extends MarkdownRenderChild {
    private syncManager: SyncManager;
    private source: string;
    private language: string;
    private plugin: any;
    private noteFile: TFile | null = null;

    private isDiffOpen = false;
    private isOutputOpen = false;
    private diffContainerEl: HTMLElement | null = null;
    private outputContainerEl: HTMLElement | null = null;

    constructor(
        containerEl: HTMLElement,
        source: string,
        language: string,
        syncManager: SyncManager,
        plugin: any,
        noteFile: TFile | null
    ) {
        super(containerEl);
        this.source = source;
        this.language = language;
        this.syncManager = syncManager;
        this.plugin = plugin;
        this.noteFile = noteFile;
    }

    async onload(): Promise<void> {
        await this.render();
    }

    async render(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        const activeFile = this.noteFile || this.plugin.app.workspace.getActiveFile();
        const syncResult = activeFile 
            ? await this.syncManager.getSyncStatus(activeFile, this.source, this.language)
            : null;

        const rootWrapper = containerEl.createDiv({ cls: 'pakcli-sync-codeblock-wrapper' });

        // =========================================================================
        // SECTION 1: SCRIPT SYNC CONTROLLER & DIFF BANNER
        // =========================================================================
        const section1 = rootWrapper.createDiv({ cls: 'pakcli-sync-section1' });

        const headerRow = section1.createDiv({ cls: 'pakcli-sync-header-row' });

        // Left info: Status badge and target file
        const leftGroup = headerRow.createDiv({ cls: 'pakcli-sync-left-group' });
        
        const statusBadge = leftGroup.createSpan({ 
            cls: `pakcli-sync-status-badge pakcli-sync-status-${syncResult?.status || 'not_mapped'}` 
        });
        statusBadge.setText(this.getStatusBadgeText(syncResult?.status));

        if (syncResult?.cliPath) {
            const vaultRoot = (this.plugin.app.vault.adapter instanceof FileSystemAdapter)
                ? this.plugin.app.vault.adapter.getBasePath()
                : '';
            const displayPath = (vaultRoot && syncResult.cliPath.startsWith(vaultRoot))
                ? path.relative(vaultRoot, syncResult.cliPath).replace(/\\/g, '/')
                : syncResult.cliPath;

            const targetPathEl = leftGroup.createSpan({ 
                cls: 'pakcli-sync-target-path', 
                text: `📁 ${displayPath}`,
                attr: { title: `Target Script: ${syncResult.cliPath} (Click to copy)` }
            });
            targetPathEl.addEventListener('click', () => {
                navigator.clipboard.writeText(syncResult.cliPath || '');
                new Notice(`Copied target path: ${syncResult.cliPath}`);
            });
        }

        // Right actions: Buttons (Execute, Diff, Ignore, Remind, Run)
        const actionsGroup = headerRow.createDiv({ cls: 'pakcli-sync-actions-group' });

        // Execute Button
        const isModified = syncResult && (syncResult.status === 'manager_modified' || syncResult.status === 'cli_modified' || syncResult.status === 'cli_missing');
        if (isModified) {
            const execBtn = actionsGroup.createEl('button', {
                cls: 'pakcli-sync-btn pakcli-sync-btn-execute',
                text: syncResult.status === 'cli_modified' ? '📥 Pull CLI' : '⚡ Sync to CLI',
                attr: { title: 'Execute sync now' }
            });
            execBtn.addEventListener('click', async () => {
                if (!activeFile) return;
                const direction = syncResult.status === 'cli_modified' ? 'cli_to_manager' : 'manager_to_cli';
                const ok = await this.syncManager.executeSync(activeFile, direction, this.source, this.language);
                if (ok) this.render();
            });
        }

        // Diff Toggle Button
        if (syncResult && syncResult.status !== 'not_mapped' && syncResult.cliCode) {
            const diffBtn = actionsGroup.createEl('button', {
                cls: `pakcli-sync-btn pakcli-sync-btn-diff ${this.isDiffOpen ? 'active' : ''}`,
                text: this.isDiffOpen ? '👁️ Hide Diff' : '👁️ Diff',
                attr: { title: 'Toggle visual line diff' }
            });
            diffBtn.addEventListener('click', () => {
                this.isDiffOpen = !this.isDiffOpen;
                this.updateDiffView(syncResult.cliCode, this.source);
                diffBtn.setText(this.isDiffOpen ? '👁️ Hide Diff' : '👁️ Diff');
                diffBtn.toggleClass('active', this.isDiffOpen);
            });
        }

        // Ignore Button
        if (isModified && activeFile && syncResult) {
            const ignoreBtn = actionsGroup.createEl('button', {
                cls: 'pakcli-sync-btn pakcli-sync-btn-ignore',
                text: '✕ Ignore',
                attr: { title: 'Ignore this change' }
            });
            ignoreBtn.addEventListener('click', async () => {
                await this.syncManager.ignoreSync(activeFile, this.source, syncResult.cliCode);
                this.render();
            });
        }

        // Remind Later Button
        if (isModified && activeFile && syncResult) {
            const remindBtn = actionsGroup.createEl('button', {
                cls: 'pakcli-sync-btn pakcli-sync-btn-remind',
                text: '⏰ Remind Later',
                attr: { title: 'Defer prompt to pending queue' }
            });
            remindBtn.addEventListener('click', async () => {
                const direction = syncResult.status === 'cli_modified' ? 'cli_to_manager' : 'manager_to_cli';
                await this.syncManager.remindLater(activeFile, direction, this.language);
                this.render();
            });
        }

        // Run Button
        const runBtn = actionsGroup.createEl('button', {
            cls: 'pakcli-sync-btn pakcli-sync-btn-run',
            text: '▶ Run',
            attr: { title: `Run ${this.language} script` }
        });
        runBtn.addEventListener('click', async () => {
            runBtn.setText('⏳ Running...');
            runBtn.setAttribute('disabled', 'true');
            const result = await this.syncManager.runScript(this.source, this.language, syncResult?.cliPath);
            runBtn.setText('▶ Run');
            runBtn.removeAttribute('disabled');
            this.showExecutionOutput(result);
        });

        // Expandable Diff Container
        this.diffContainerEl = section1.createDiv({ cls: 'pakcli-sync-diff-container' });
        this.diffContainerEl.style.display = this.isDiffOpen ? 'block' : 'none';
        if (this.isDiffOpen && syncResult) {
            renderDiffViewer(this.diffContainerEl, syncResult.cliCode, this.source);
        }

        // Expandable Run Output Container
        this.outputContainerEl = section1.createDiv({ cls: 'pakcli-sync-output-container' });
        this.outputContainerEl.style.display = this.isOutputOpen ? 'block' : 'none';

        // =========================================================================
        // SECTION 2: CODEBLOCK VIEW & SCALER
        // =========================================================================
        const section2 = rootWrapper.createDiv({ cls: 'pakcli-sync-section2' });

        const codeHeader = section2.createDiv({ cls: 'pakcli-codeblock-header' });
        codeHeader.createSpan({ cls: 'pakcli-codeblock-lang-tag', text: this.language.toUpperCase() });

        const copyBtn = codeHeader.createEl('button', {
            cls: 'pakcli-codeblock-copy-btn',
            text: '📋 Copy',
            attr: { title: 'Copy code to clipboard' }
        });
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(this.source);
            copyBtn.setText('✓ Copied!');
            setTimeout(() => copyBtn.setText('📋 Copy'), 2000);
        });

        const codeBody = section2.createDiv({ cls: 'pakcli-codeblock-body' });

        const scaler = this.plugin.codeblockScaler;
        const behavior = scaler ? scaler.getBehaviorForLanguage(this.language) : 'flowclip';

        if (behavior === 'scalefit' && (this.language === 'asci' || this.language === 'ascii' || this.language === 'scalefit')) {
            renderAsciiSvg(this.source, codeBody);
        } else {
            const pre = codeBody.createEl('pre', {
                cls: `pakcli-codeblock ${behavior === 'wrap' ? 'pakcli-codeblock-wrap' : 'pakcli-codeblock-flowclip'}`
            });
            const code = pre.createEl('code', { cls: `language-${this.language}` });
            code.textContent = this.source;
        }
    }

    private updateDiffView(cliCode: string, managerCode: string): void {
        if (!this.diffContainerEl) return;
        this.diffContainerEl.style.display = this.isDiffOpen ? 'block' : 'none';
        if (this.isDiffOpen) {
            renderDiffViewer(this.diffContainerEl, cliCode, managerCode);
        }
    }

    private showExecutionOutput(res: { stdout: string; stderr: string; exitCode: number }): void {
        if (!this.outputContainerEl) return;
        this.isOutputOpen = true;
        this.outputContainerEl.empty();
        this.outputContainerEl.style.display = 'block';

        const outHeader = this.outputContainerEl.createDiv({ cls: 'pakcli-output-header' });
        outHeader.createSpan({ 
            cls: `pakcli-output-status ${res.exitCode === 0 ? 'success' : 'error'}`,
            text: res.exitCode === 0 ? '✓ Script Succeeded (Exit 0)' : `✕ Script Failed (Exit ${res.exitCode})`
        });

        const closeBtn = outHeader.createEl('button', { cls: 'pakcli-output-close-btn', text: '✕' });
        closeBtn.addEventListener('click', () => {
            this.isOutputOpen = false;
            if (this.outputContainerEl) this.outputContainerEl.style.display = 'none';
        });

        if (res.stdout) {
            const outPre = this.outputContainerEl.createEl('pre', { cls: 'pakcli-output-stdout' });
            outPre.textContent = res.stdout;
        }
        if (res.stderr) {
            const errPre = this.outputContainerEl.createEl('pre', { cls: 'pakcli-output-stderr' });
            errPre.textContent = res.stderr;
        }
    }

    private getStatusBadgeText(status?: string): string {
        switch (status) {
            case 'synced': return '✓ Synced';
            case 'manager_modified': return '⚡ Manager Modified';
            case 'cli_modified': return '📥 CLI Modified';
            case 'conflict': return '⚠️ Conflict';
            case 'cli_missing': return '📄 CLI File Missing';
            case 'not_mapped': return '⚙️ Set CLI Folder in Settings';
            default: return '● Unknown';
        }
    }
}
