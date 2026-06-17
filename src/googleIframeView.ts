import { App, ItemView, Modal, Notice, Setting, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type MyPlugin from './main';
import { isGoogleConnected } from './googleAuth';
import { getFileWebViewLink } from './googleDriveApi';

export const GOOGLE_IFRAME_VIEW_TYPE = 'google-iframe';

// ─────────────────────────────────────────────
//  URL Input Modal
// ─────────────────────────────────────────────
class UrlInputModal extends Modal {
  private filePath: string;
  private fileName: string;
  private onSubmit: (url: string) => void;
  private inputValue = '';

  constructor(app: App, filePath: string, fileName: string, onSubmit: (url: string) => void) {
    super(app);
    this.filePath = filePath;
    this.fileName = fileName;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Title
    contentEl.createEl('h2', { text: `Open: ${this.fileName}` });
    contentEl.createEl('p', {
      text: 'This Google Workspace file cannot be read from disk (Google Drive streaming mode). '
          + 'Please paste the Google URL below so it can be opened inside Obsidian.',
      cls: 'google-embed-modal-desc'
    });

    // Instructions
    const ol = contentEl.createEl('ol', { cls: 'google-embed-modal-steps' });
    ol.createEl('li', { text: 'Open Google Drive in your browser' });
    ol.createEl('li', { text: 'Find and open this file' });
    ol.createEl('li', { text: 'Copy the URL from the address bar' });
    ol.createEl('li', { text: 'Paste it below and click Open' });

    // Input
    let inputEl: HTMLInputElement;
    new Setting(contentEl)
      .setName('Google URL')
      .addText(text => {
        inputEl = text.inputEl;
        text.setPlaceholder('https://docs.google.com/...')
          .onChange(val => { this.inputValue = val.trim(); });
        text.inputEl.style.width = '100%';
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
        });
      });

    // Buttons
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Open in Obsidian')
        .setCta()
        .onClick(() => this.submit()))
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => this.close()));

    // Auto-focus input
    setTimeout(() => inputEl?.focus(), 50);
  }

  private submit() {
    const url = this.inputValue;
    if (!url || !url.startsWith('http')) {
      new Notice('Please paste a valid Google URL first.');
      return;
    }
    this.close();
    this.onSubmit(url);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─────────────────────────────────────────────
//  Google Workspace WebView
// ─────────────────────────────────────────────
export default class GoogleIframeView extends ItemView {
  private webviewEl: HTMLElement | null = null;
  private currentUrl = '';
  private currentTitle = 'Google Workspace';
  private filePath = '';
  private plugin: MyPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return GOOGLE_IFRAME_VIEW_TYPE; }
  getDisplayText(): string { return this.currentTitle; }
  getIcon(): string { return 'globe'; }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    // Use position:relative so the absolute webview can fill it
    container.style.cssText = 'position:relative;padding:0;margin:0;width:100%;height:100%;overflow:hidden;';

    // Electron <webview> needs EXPLICIT pixel height — percentage heights are ignored
    const webview = document.createElement('webview') as HTMLElement;
    webview.setAttribute('allowpopups', '');
    webview.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border:none;';

    webview.addEventListener('page-title-updated', (e: any) => {
      this.currentTitle = e.title ?? this.currentTitle;
      (this.leaf as any).updateHeader?.();
    });

    container.appendChild(webview);
    this.webviewEl = webview;

    // ResizeObserver: set exact pixel height whenever the container resizes
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        const w = entry.contentRect.width;
        if (h > 0 && this.webviewEl) {
          this.webviewEl.style.height = h + 'px';
          this.webviewEl.style.width  = w + 'px';
        }
      }
    });
    observer.observe(container);
    // Clean up observer when view closes
    this.register(() => observer.disconnect());

    // If URL was already loaded (setState ran before onOpen)
    if (this.currentUrl) {
      (webview as any).src = this.currentUrl;
    }
  }


  async setState(state: any, result: ViewStateResult): Promise<void> {
    // ── Duplicate-tab guard ──────────────────────────────────────────────────
    // If this file is already open in another leaf, close this new leaf and
    // bring the existing one to focus instead.
    if (state?.file) {
      const existingLeaves = this.app.workspace.getLeavesOfType(GOOGLE_IFRAME_VIEW_TYPE);
      for (const other of existingLeaves) {
        if (other === this.leaf) continue; // skip self
        const otherState = other.getViewState()?.state as any;
        if (otherState?.file === state.file) {
          // Defer so the current leaf finishes construction before being removed
          setTimeout(() => {
            this.app.workspace.revealLeaf(other);
            this.leaf.detach();
          }, 0);
          return; // skip rest of setState for this duplicate
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (state?.file) {
      this.filePath = state.file;
      const fileName = state.file.split('/').pop() ?? state.file;
      this.currentTitle = fileName.replace(/\.[^.]+$/, '');
    }


    // Priority 1: URL already in state (saved from a previous session)
    if (state?.url && state.url !== '') {
      this.navigateTo(state.url);
      await super.setState(state, result);
      return;
    }

    // Priority 2: URL saved in plugin's urlCache
    const cachedUrl = this.plugin.settings.urlCache?.[this.filePath];
    if (cachedUrl) {
      this.navigateTo(cachedUrl);
      await super.setState(state, result);
      return;
    }

    // Priority 3: Google Drive REST API (auto, if connected)
    if (this.filePath && isGoogleConnected(this.plugin)) {
      const fileNamePart = this.filePath.split('/').pop() ?? '';
      const ext = fileNamePart.split('.').pop() ?? '';
      const baseName = fileNamePart.replace(/\.[^.]+$/, '');
      try {
        const apiUrl = await getFileWebViewLink(this.plugin, baseName, ext);
        if (apiUrl) {
          if (!this.plugin.settings.urlCache) this.plugin.settings.urlCache = {};
          this.plugin.settings.urlCache[this.filePath] = apiUrl;
          await this.plugin.saveSettings();
          this.navigateTo(apiUrl);
          await super.setState(state, result);
          return;
        }
        new Notice(`⚠️ Could not find "${baseName}" in Google Drive. Please paste the URL manually.`);
      } catch (e: any) {
        console.error('[GDrive API] Error:', e);
        new Notice('⚠️ Drive API error. Please paste the URL manually.');
      }
    }

    // Priority 4: Show URL input modal (fallback)
    if (this.filePath) {
      const fileName = this.filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? this.filePath;
      new UrlInputModal(this.app, this.filePath, fileName, async (url) => {
        // Save to persistent cache
        if (!this.plugin.settings.urlCache) this.plugin.settings.urlCache = {};
        this.plugin.settings.urlCache[this.filePath] = url;
        await this.plugin.saveSettings();

        this.navigateTo(url);
        new Notice(`Saved URL for ${fileName}. It will open automatically next time.`);
      }).open();
    }

    await super.setState(state, result);
  }

  /**
   * Attempt to extract the Google URL automatically from:
   * 1. NTFS Alternate Data Streams (PowerShell: Get-Item -Stream *)
   * 2. Windows extended file attributes
   */
  private async tryAutoDetectUrl(vaultRelPath: string): Promise<string | null> {
    const path = require('path') as typeof import('path');
    const { execSync } = require('child_process') as typeof import('child_process');
    const basePath = (this.app.vault.adapter as any).basePath;
    const fullPath = path.join(basePath, vaultRelPath);
    const findUrl = (s: string) =>
      (s.match(/https:\/\/docs\.google\.com\/[^\s"'<>\]]+/) ?? [])[0] ?? null;

    // 1. List all NTFS alternate data streams and read each one
    try {
      const escaped = fullPath.replace(/'/g, "''");
      const streamList = execSync(
        `powershell -NoProfile -NonInteractive -Command "` +
        `Get-Item -LiteralPath '${escaped}' -Stream * | Select-Object -ExpandProperty Stream"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      console.log('[GDrive AutoDetect] NTFS streams:', streamList);
      const streams = streamList.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);

      for (const stream of streams) {
        if (stream === ':$DATA' || stream === '$DATA' || stream === '') continue;
        try {
          const content = execSync(
            `powershell -NoProfile -NonInteractive -Command "` +
            `Get-Content -LiteralPath '${escaped}' -Stream '${stream}' -Raw"`,
            { encoding: 'utf8', timeout: 5000 }
          );
          console.log(`[GDrive AutoDetect] stream "${stream}":`, content.substring(0, 200));
          const url = findUrl(content);
          if (url) return url;
        } catch {}
      }
    } catch (e: any) {
      console.warn('[GDrive AutoDetect] ADS read failed:', e.message);
    }

    // 2. Try reading Google Drive metadata db path from known locations
    try {
      const os = require('os') as typeof import('os');
      const fs = require('fs') as typeof import('fs');
      const driveFsPath = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'DriveFS');
      if (fs.existsSync(driveFsPath)) {
        // Read the account dirs
        const accounts = fs.readdirSync(driveFsPath);
        console.log('[GDrive AutoDetect] DriveFS accounts:', accounts);
        // Try shell command to get file ID from Google Drive VFS
        const fname = path.basename(fullPath, path.extname(fullPath));
        const escaped = fname.replace(/'/g, "''");
        try {
          const result = execSync(
            `powershell -NoProfile -NonInteractive -Command "` +
            `(Get-Item -LiteralPath '${fullPath.replace(/'/g, "''")}').` +
            `GetType().GetProperty('FileId') | Select-Object -ExpandProperty Value"`,
            { encoding: 'utf8', timeout: 5000 }
          );
          console.log('[GDrive AutoDetect] FileId result:', result);
        } catch {}
      }
    } catch {}

    return null;
  }


  getState(): Record<string, unknown> {
    return {
      file: this.filePath,
      url: this.currentUrl,
      title: this.currentTitle,
    };
  }

  navigateTo(url: string, title?: string, filePath?: string) {
    if (url) this.currentUrl = url;
    if (title) this.currentTitle = title;
    if (filePath) this.filePath = filePath;
    if (this.webviewEl) (this.webviewEl as any).src = this.currentUrl;
    (this.leaf as any).updateHeader?.();
  }

  async onClose() {
    this.webviewEl?.remove();
    this.webviewEl = null;
  }
}
