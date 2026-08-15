/**
 * types.ts - Data contracts for Two-Section Codeblock & Folder Sync Manager
 */

export type SyncStatusType = 
    | 'synced'
    | 'manager_modified'
    | 'cli_modified'
    | 'conflict'
    | 'not_mapped'
    | 'cli_missing';

export interface CodeBlockExtractResult {
    language: string;
    code: string;
    startIndex: number;
    endIndex: number;
    header: string; // The ```lang line
}

export interface SyncStatusResult {
    status: SyncStatusType;
    statusLabel: string;
    cliPath: string | null;
    managerCode: string;
    cliCode: string;
    language: string;
    lastSyncedTime?: number;
}

export interface PendingSyncItem {
    id: string;
    notePath: string;
    cliPath: string;
    direction: 'manager_to_cli' | 'cli_to_manager';
    timestamp: number;
    language: string;
    summary: string;
}

export interface FolderSyncSettings {
    enabled: boolean;
    cliRootFolder: string;
    managerRootFolder: string; // Vault-relative path, e.g. "scripts" or "" for vault root
    languageExtensionMap: Record<string, string>;
    autoWatchCliFolder: boolean;
    pendingChanges: PendingSyncItem[];
    ignoredHashes: Record<string, string>; // notePath -> last ignored hash pair
}

export const DEFAULT_FOLDER_SYNC_SETTINGS: FolderSyncSettings = {
    enabled: true,
    cliRootFolder: '',
    managerRootFolder: '',
    languageExtensionMap: {
        powershell: 'ps1',
        ps1: 'ps1',
        pwsh: 'ps1',
        cmd: 'cmd',
        bat: 'bat',
        batch: 'bat',
        dos: 'bat',
        bash: 'sh',
        sh: 'sh',
        gitbash: 'sh',
        zsh: 'sh',
        shell: 'sh',
        python: 'py',
        py: 'py',
        javascript: 'js',
        js: 'js',
        typescript: 'ts',
        ts: 'ts',
        sql: 'sql',
        json: 'json',
        yaml: 'yaml',
        yml: 'yml',
        markdown: 'md',
        md: 'md'
    },
    autoWatchCliFolder: true,
    pendingChanges: [],
    ignoredHashes: {}
};
