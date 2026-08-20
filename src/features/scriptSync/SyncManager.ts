/**
 * SyncManager.ts
 *
 * Core engine for two-way synchronization between Manager (.md notes) and CLI (script files).
 */
import { App, FileSystemAdapter, Notice, Plugin, TFile } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { FolderSyncSettings, PendingSyncItem, SyncStatusResult, SyncStatusType } from './types';
import { extractFirstCodeBlock, injectFirstCodeBlock } from './markdownParser';

export class SyncManager {
    private app: App;
    private plugin: Plugin;
    private getSettings: () => FolderSyncSettings;
    private saveSettings: () => Promise<void>;
    private fileWatchers: fs.FSWatcher[] = [];

    constructor(
        app: App,
        plugin: Plugin,
        getSettings: () => FolderSyncSettings,
        saveSettings: () => Promise<void>
    ) {
        this.app = app;
        this.plugin = plugin;
        this.getSettings = getSettings;
        this.saveSettings = saveSettings;
    }

    init(): void {
        this.setupWatcher();
    }

    destroy(): void {
        this.stopWatcher();
    }

    private getVaultRoot(): string {
        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            return this.app.vault.adapter.getBasePath();
        }
        return '';
    }

    private setupWatcher(): void {
        this.stopWatcher();
        const settings = this.getSettings();
        if (!settings.enabled || !settings.autoWatchCliFolder || !settings.cliRootFolder) return;

        try {
            let targetDir = settings.cliRootFolder.trim();
            if (!path.isAbsolute(targetDir)) {
                targetDir = path.join(this.getVaultRoot(), targetDir);
            }

            if (fs.existsSync(targetDir)) {
                const watcher = fs.watch(targetDir, { recursive: true }, () => {
                    // Watcher event
                });
                this.fileWatchers.push(watcher);
            }
        } catch (err) {
            console.debug('[CodeblockSync] Watcher init error:', err);
        }
    }

    private stopWatcher(): void {
        this.fileWatchers.forEach(w => {
            try { w.close(); } catch {
                // Ignore watcher close error
            }
        });
        this.fileWatchers = [];
    }

    /** Compute SHA-256 hash of a string with normalized line endings. */
    computeHash(text: string): string {
        const normalized = (text || '').replace(/\r\n/g, '\n').trim();
        return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
    }

    /**
     * Resolves the corresponding script path on disk for a given note and language.
     * Supports both self-vault relative paths (e.g. "scripts" -> "<vaultRoot>/scripts/deploy.ps1")
     * and external absolute paths (e.g. "D:/scripts" -> "D:/scripts/deploy.ps1").
     */
    resolveCliPath(notePath: string, language: string): string | null {
        const settings = this.getSettings();
        const rawCliFolder = (settings.cliRootFolder || '').trim();
        if (!rawCliFolder) return null;

        const lang = (language || '').trim().toLowerCase();
        const ext = settings.languageExtensionMap[lang] || lang || 'ps1';

        // Normalize slashes for subfolder matching
        const normNotePath = notePath.replace(/\\/g, '/');
        let relPath = normNotePath;

        const managerRoot = settings.managerRootFolder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (managerRoot) {
            if (relPath === managerRoot) {
                relPath = path.basename(normNotePath);
            } else if (relPath.startsWith(managerRoot + '/')) {
                relPath = relPath.slice(managerRoot.length).replace(/^\/+/, '');
            }
        }

        // Replace .md extension with target script extension
        const parsed = path.parse(relPath);
        const scriptRel = path.join(parsed.dir, `${parsed.name}.${ext}`);

        if (path.isAbsolute(rawCliFolder)) {
            return path.normalize(path.join(rawCliFolder, scriptRel));
        } else {
            const vaultRoot = this.getVaultRoot();
            return path.normalize(path.join(vaultRoot, rawCliFolder, scriptRel));
        }
    }

    /**
     * Inspects the note's first codeblock vs the CLI script file and determines the sync state.
     */
    async getSyncStatus(noteFile: TFile, activeCode?: string, lang?: string): Promise<SyncStatusResult> {
        let managerCode = activeCode ?? '';
        let language = lang ?? 'powershell';

        if (activeCode === undefined) {
            try {
                const content = await this.app.vault.read(noteFile);
                const extracted = extractFirstCodeBlock(content);
                if (extracted) {
                    managerCode = extracted.code;
                    language = extracted.language;
                }
            } catch {
                // Ignore vault read failure
            }
        }

        const cliPath = this.resolveCliPath(noteFile.path, language);
        if (!cliPath) {
            return {
                status: 'not_mapped',
                statusLabel: 'CLI Root Folder Not Configured',
                cliPath: null,
                managerCode,
                cliCode: '',
                language
            };
        }

        if (!fs.existsSync(cliPath)) {
            return {
                status: 'cli_missing',
                statusLabel: 'CLI Script Not Created',
                cliPath,
                managerCode,
                cliCode: '',
                language
            };
        }

        let cliCode = '';
        try {
            cliCode = await fs.promises.readFile(cliPath, 'utf8');
        } catch {
            return {
                status: 'cli_missing',
                statusLabel: 'Unable to Read CLI Script',
                cliPath,
                managerCode,
                cliCode: '',
                language
            };
        }

        const managerHash = this.computeHash(managerCode);
        const cliHash = this.computeHash(cliCode);

        // Check if identical
        if (managerHash === cliHash) {
            return {
                status: 'synced',
                statusLabel: 'In Sync',
                cliPath,
                managerCode,
                cliCode,
                language
            };
        }

        // Check if this difference was previously ignored
        const settings = this.getSettings();
        const ignoreKey = `${noteFile.path}:${managerHash}:${cliHash}`;
        if (settings.ignoredHashes[ignoreKey]) {
            return {
                status: 'synced',
                statusLabel: 'In Sync (Ignored Diff)',
                cliPath,
                managerCode,
                cliCode,
                language
            };
        }

        // Compare modification timestamps to determine primary direction
        let status: SyncStatusType = 'manager_modified';
        let statusLabel = 'Manager Codeblock Modified';

        try {
            const stat = await fs.promises.stat(cliPath);
            const cliMtime = stat.mtimeMs;
            const noteMtime = noteFile.stat.mtime;

            if (cliMtime > noteMtime + 2000) {
                status = 'cli_modified';
                statusLabel = 'CLI Script Modified on Disk';
            } else if (Math.abs(cliMtime - noteMtime) < 2000) {
                status = 'conflict';
                statusLabel = 'Both Modified (Potential Conflict)';
            }
        } catch {
            // Ignore stat errors for missing or inaccessible files
        }

        return {
            status,
            statusLabel,
            cliPath,
            managerCode,
            cliCode,
            language
        };
    }

    /**
     * Executes the sync operation in the specified direction.
     */
    async executeSync(
        noteFile: TFile,
        direction: 'manager_to_cli' | 'cli_to_manager',
        codeToSync?: string,
        language?: string
    ): Promise<boolean> {
        try {
            const currentContent = await this.app.vault.read(noteFile);
            const extracted = extractFirstCodeBlock(currentContent);
            const lang = language || extracted?.language || 'powershell';
            const cliPath = this.resolveCliPath(noteFile.path, lang);

            if (!cliPath) {
                new Notice('Folder Sync: CLI Root Folder not configured in settings.');
                return false;
            }

            if (direction === 'manager_to_cli') {
                const code = codeToSync ?? (extracted ? extracted.code : '');
                const targetDir = path.dirname(cliPath);
                if (!fs.existsSync(targetDir)) {
                    await fs.promises.mkdir(targetDir, { recursive: true });
                }
                await fs.promises.writeFile(cliPath, code, 'utf8');
                this.removeFromPending(noteFile.path);
                new Notice(`✓ Synced to CLI: ${path.basename(cliPath)}`);
                return true;
            } else {
                // CLI -> Manager direction
                if (!fs.existsSync(cliPath)) {
                    new Notice(`Folder Sync: File does not exist at ${cliPath}`);
                    return false;
                }
                const cliContent = await fs.promises.readFile(cliPath, 'utf8');
                const updatedNote = injectFirstCodeBlock(currentContent, cliContent, lang);
                await this.app.vault.modify(noteFile, updatedNote);
                this.removeFromPending(noteFile.path);
                new Notice(`✓ Updated note codeblock from CLI: ${path.basename(cliPath)}`);
                return true;
            }
        } catch (err) {
            console.error('[FolderSync] executeSync failed:', err);
            new Notice(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    /** Marks the current diff as ignored. */
    async ignoreSync(noteFile: TFile, managerCode: string, cliCode: string): Promise<void> {
        const settings = this.getSettings();
        const managerHash = this.computeHash(managerCode);
        const cliHash = this.computeHash(cliCode);
        const ignoreKey = `${noteFile.path}:${managerHash}:${cliHash}`;

        settings.ignoredHashes[ignoreKey] = new Date().toISOString();
        this.removeFromPending(noteFile.path);
        await this.saveSettings();
        new Notice('Change ignored for this sync session.');
    }

    /** Defers the prompt and adds it to the pending review queue. */
    async remindLater(noteFile: TFile, direction: 'manager_to_cli' | 'cli_to_manager', lang: string): Promise<void> {
        const settings = this.getSettings();
        const cliPath = this.resolveCliPath(noteFile.path, lang) || '';

        const item: PendingSyncItem = {
            id: `${noteFile.path}_${Date.now()}`,
            notePath: noteFile.path,
            cliPath,
            direction,
            timestamp: Date.now(),
            language: lang,
            summary: `${path.basename(noteFile.path)} (${direction === 'manager_to_cli' ? 'Manager → CLI' : 'CLI → Manager'})`
        };

        this.removeFromPending(noteFile.path);
        settings.pendingChanges.push(item);
        await this.saveSettings();
        new Notice('Change deferred to Pending Changes list.');
    }

    private removeFromPending(notePath: string): void {
        const settings = this.getSettings();
        settings.pendingChanges = settings.pendingChanges.filter(i => i.notePath !== notePath);
    }

    /**
     * Executes the script on demand via PowerShell or Bash/Node and returns output.
     */
    async runScript(code: string, language: string, cliPath?: string | null): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise((resolve) => {
            const lang = (language || '').trim().toLowerCase();
            let command = '';

            if (cliPath && fs.existsSync(cliPath)) {
                if (lang === 'powershell' || lang === 'ps1') {
                    command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${cliPath}"`;
                } else if (lang === 'python' || lang === 'py') {
                    command = `python "${cliPath}"`;
                } else if (lang === 'javascript' || lang === 'js') {
                    command = `node "${cliPath}"`;
                } else if (lang === 'bash' || lang === 'sh') {
                    command = `bash "${cliPath}"`;
                } else {
                    command = `"${cliPath}"`;
                }
            } else {
                // Execute inline code via interpreter
                if (lang === 'powershell' || lang === 'ps1') {
                    const encoded = Buffer.from(code, 'utf16le').toString('base64');
                    command = `powershell -NoProfile -EncodedCommand ${encoded}`;
                } else if (lang === 'python' || lang === 'py') {
                    const escaped = code.replace(/"/g, '\\"');
                    command = `python -c "${escaped}"`;
                } else if (lang === 'javascript' || lang === 'js') {
                    const escaped = code.replace(/"/g, '\\"');
                    command = `node -e "${escaped}"`;
                } else {
                    command = code;
                }
            }

            exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || (err ? err.message : ''),
                    exitCode: err && typeof err.code === 'number' ? err.code : 0
                });
            });
        });
    }
}
