import { App, ItemView, Modal, Notice, Setting, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type MyPlugin from './main';
import { isGoogleConnected } from './googleAuth';
import { getFileWebViewLink } from './googleDriveApi';

export const GOOGLE_IFRAME_VIEW_TYPE = 'google-iframe';

export function cleanGoogleUrl(url: string): string {
  if (!url) return url;
  // Strip trailing quotes or symbols that might be matched by regex
  url = url.replace(/['"()]+$/g, '');
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('usp');
    return parsed.toString();
  } catch {
    return url.replace(/([?&])usp=[^&]+/g, '')
              .replace(/\?&/g, '?')
              .replace(/[?&]$/g, '');
  }
}

export function urlsMatch(url1: string, url2: string): boolean {
  if (!url1 || !url2) return url1 === url2;
  const clean1 = cleanGoogleUrl(url1).replace(/\/+$/, '');
  const clean2 = cleanGoogleUrl(url2).replace(/\/+$/, '');
  return clean1 === clean2;
}

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
    container.style.cssText = 'display:flex;flex-direction:column;padding:0;margin:0;width:100%;height:100%;overflow:hidden;';

    // ── Navigation toolbar ───────────────────────────────────────────────
    const toolbar = container.createEl('div', { cls: 'gview-toolbar' });

    // Back
    const backBtn = toolbar.createEl('button', { cls: 'gview-nav-btn', title: 'Back' });
    backBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;

    // Forward
    const fwdBtn = toolbar.createEl('button', { cls: 'gview-nav-btn', title: 'Forward' });
    fwdBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`;

    // Reload
    const reloadBtn = toolbar.createEl('button', { cls: 'gview-nav-btn', title: 'Reload' });
    reloadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;

    // URL bar (flex fills remaining space)
    const urlBar = toolbar.createEl('div', { cls: 'gview-url-bar' });
    const urlText = urlBar.createEl('span', { cls: 'gview-url-text', text: this.currentUrl });

    // ── Right-side action buttons ────────────────────────────────────────
    toolbar.createEl('div', { cls: 'gview-toolbar-sep' });

    // ★ Bookmark star — saves URL to plugin cache + shows notice
    const starBtn = toolbar.createEl('button', { cls: 'gview-nav-btn gview-star-btn', title: 'Save bookmark' });
    starBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

    // Split pane — open same URL in a vertical split
    const splitBtn = toolbar.createEl('button', { cls: 'gview-nav-btn', title: 'Split view' });
    splitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 3h18v18H3V3zm8 2H5v14h6V5zm8 0h-6v14h6V5z"/></svg>`;

    // Open in system browser
    const openExternalBtn = toolbar.createEl('button', { cls: 'gview-nav-btn', title: 'Open in browser' });
    openExternalBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;



    // ── Webview ──────────────────────────────────────────────────────────
    const webviewWrap = container.createEl('div', { cls: 'gview-webview-wrap' });
    webviewWrap.style.cssText = 'position:relative;flex:1;min-height:0;overflow:hidden;';

    const webview = document.createElement('webview') as HTMLElement;
    webview.setAttribute('allowpopups', '');
    webview.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';

    webviewWrap.appendChild(webview);
    this.webviewEl = webview;

    // ★ Star: save current URL to plugin cache (turns gold when saved)
    const updateStarState = () => {
      const url = this.currentUrl;
      const isSaved = url && this.plugin.settings.urlCache &&
        Object.values(this.plugin.settings.urlCache).includes(url);
      starBtn.classList.toggle('gview-star-saved', !!isSaved);
      starBtn.title = isSaved ? 'Bookmarked ✓' : 'Save bookmark';
    };

    // ── Helpers to update nav button state ───────────────────────────────
    const updateNavBtns = () => {
      const wv = webview as any;
      backBtn.disabled   = !wv.canGoBack?.();
      fwdBtn.disabled    = !wv.canGoForward?.();
      
      let currentSrc = this.currentUrl;
      if (wv && typeof wv.getURL === 'function') {
        try {
          currentSrc = wv.getURL() || wv.src || this.currentUrl;
        } catch (e) {
          currentSrc = wv.src || this.currentUrl;
        }
      } else if (wv) {
        currentSrc = wv.src || this.currentUrl;
      }
      this.currentUrl = currentSrc;

      urlText.textContent = currentSrc;
      urlText.title       = currentSrc;
      updateStarState();
    };

    // ── Wire toolbar buttons ─────────────────────────────────────────────
    backBtn.addEventListener('click', () => { (webview as any).goBack?.(); });
    fwdBtn.addEventListener('click',  () => { (webview as any).goForward?.(); });
    reloadBtn.addEventListener('click', () => { (webview as any).reload?.(); });

    openExternalBtn.addEventListener('click', () => {
      const url = this.currentUrl;
      if (url) {
        try { require('electron').shell.openExternal(url); }
        catch { window.open(url, '_blank'); }
      }
    });

    starBtn.addEventListener('click', async () => {
      const url = this.currentUrl;
      const title = this.currentTitle || url;
      if (!url) return;
      if (!this.plugin.settings.urlCache) this.plugin.settings.urlCache = {};
      // Use title as key so it shows up nicely in the cache settings panel
      const key = `_bookmark_${title}`;
      this.plugin.settings.urlCache[key] = url;
      await this.plugin.saveSettings();
      updateStarState();
      const { Notice } = await import('obsidian');
      new Notice(`★ Bookmarked: ${title}`);
    });

    // ⊞ Split: open same URL in a new vertical split pane
    splitBtn.addEventListener('click', async () => {
      const url = this.currentUrl;
      if (!url) return;
      const { GOOGLE_IFRAME_VIEW_TYPE: TYPE } = await import('./googleIframeView');
      const newLeaf = this.app.workspace.getLeaf('split');
      await newLeaf.setViewState({
        type: TYPE,
        state: { url, title: this.currentTitle, file: '' },
      });
      this.app.workspace.revealLeaf(newLeaf);
    });



    // ── Webview navigation events ────────────────────────────────────────
    webview.addEventListener('page-title-updated', (e: any) => {
      this.currentTitle = e.title ?? this.currentTitle;
      (this.leaf as any).updateHeader?.();
    });
    webview.addEventListener('did-navigate',         updateNavBtns);
    webview.addEventListener('did-navigate-in-page', updateNavBtns);
    webview.addEventListener('did-finish-load',      updateNavBtns);

    // ── ResizeObserver: set pixel height on wrap ─────────────────────────
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
    observer.observe(webviewWrap);
    this.register(() => observer.disconnect());

    // ── Initial nav (if setState already ran) ────────────────────────────
    if (this.currentUrl) {
      (webview as any).src = this.currentUrl;
      urlText.textContent  = this.currentUrl;
    }

    // Initial button state after webview is ready
    webview.addEventListener('dom-ready', updateNavBtns);

    // Disable buttons until webview is ready
    backBtn.disabled = true;
    fwdBtn.disabled  = true;
  }




  async setState(state: any, result: ViewStateResult): Promise<void> {
    // ── Duplicate-tab guard ──────────────────────────────────────────────────
    // If this file is already open in another leaf AND it is still on the same URL,
    // close this new leaf and bring the existing one to focus instead.
    const file = state?.file || state?.filePath;
    if (file) {
      const existingLeaves = this.app.workspace.getLeavesOfType(GOOGLE_IFRAME_VIEW_TYPE);
      for (const other of existingLeaves) {
        if (other === this.leaf) continue; // skip self
        const otherState = other.getViewState()?.state as any;
        const otherFile = otherState?.file || otherState?.filePath;
        if (otherFile === file) {
          const otherView = other.view as any;
          const otherCurrentUrl = (otherView && typeof otherView.getCurrentUrl === 'function')
            ? otherView.getCurrentUrl()
            : otherState?.url;

          const targetUrl = state.url || this.plugin.settings.urlCache?.[file];
          if (urlsMatch(otherCurrentUrl, targetUrl)) {
            // Defer so the current leaf finishes construction before being removed
            setTimeout(() => {
              this.app.workspace.revealLeaf(other);
              this.leaf.detach();
            }, 0);
            return; // skip rest of setState for this duplicate
          }
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


  getCurrentUrl(): string {
    if (this.webviewEl) {
      try {
        const wv = this.webviewEl as any;
        if (typeof wv.getURL === 'function') {
          return wv.getURL() || this.currentUrl;
        }
      } catch {}
    }
    return this.currentUrl;
  }

  getState(): Record<string, unknown> {
    return {
      file: this.filePath,
      url: this.getCurrentUrl(),
      title: this.currentTitle,
    };
  }

  navigateTo(url: string, title?: string, filePath?: string) {
    if (url) this.currentUrl = cleanGoogleUrl(url);
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
