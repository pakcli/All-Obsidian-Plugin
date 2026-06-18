import { App, ItemView, Modal, Notice, Setting, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type MyPlugin from './main';
import { isGoogleConnected } from './googleAuth';
import { getFileWebViewLink } from './googleDriveApi';

export const GOOGLE_IFRAME_VIEW_TYPE = 'google-iframe';

export interface UrlCleaningRule {
  id: string;
  domainPrefix: string;
  suffix: string;
}

export function applyUrlCleaningRules(url: string, rules?: UrlCleaningRule[]): string {
  if (!url || !rules || rules.length === 0) return url;
  let cleaned = url;
  for (const rule of rules) {
    if (!rule.domainPrefix || !rule.suffix) continue;
    if (cleaned.startsWith(rule.domainPrefix)) {
      const escapedSuffix = rule.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace '?suffix', '&suffix', or just 'suffix'
      const regex = new RegExp(`[?&]${escapedSuffix}&?|${escapedSuffix}`, 'g');
      cleaned = cleaned.replace(regex, (match) => {
        if (match.startsWith('?')) {
          return match.endsWith('&') ? '?' : '';
        }
        if (match.startsWith('&')) {
          return match.endsWith('&') ? '&' : '';
        }
        return '';
      });
      cleaned = cleaned.replace(/[?&]+$/g, '');
    }
  }
  return cleaned;
}

export function cleanGoogleUrl(url: string, rules?: UrlCleaningRule[]): string {
  if (!url) return url;
  // Apply custom cleaning rules first
  url = applyUrlCleaningRules(url, rules);
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

export function extractGoogleFileId(url: string): string | null {
  if (!url) return null;
  // Match standard /d/FILE_ID/ pattern
  const dMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];

  // Match folders/FOLDER_ID pattern
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];

  return null;
}

export function urlsMatch(url1: string, url2: string, rules?: UrlCleaningRule[]): boolean {
  if (!url1 || !url2) return url1 === url2;

  // 1. Match by Google File ID if both contain one
  const id1 = extractGoogleFileId(url1);
  const id2 = extractGoogleFileId(url2);
  if (id1 && id2) {
    return id1 === id2;
  }

  // 2. Fallback to cleaned URL match
  const clean1 = cleanGoogleUrl(url1, rules).replace(/\/+$/, '');
  const clean2 = cleanGoogleUrl(url2, rules).replace(/\/+$/, '');
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
  private faviconObserver: MutationObserver | null = null;
  private failedFavicons = new Set<string>();
  private coverEl: HTMLElement | null = null;

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

    // Prevent horizontal offsets from text selection scrolling
    urlBar.addEventListener('scroll', () => { urlBar.scrollLeft = 0; });
    urlText.addEventListener('scroll', () => { urlText.scrollLeft = 0; });

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

    // Loading cover to prevent white flashes (only shown if Obsidian is in dark mode)
    const isDarkTheme = document.body.classList.contains('theme-dark');
    const coverEl = webviewWrap.createEl('div', { cls: 'gview-loading-cover' });
    coverEl.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;background-color:var(--background-primary);z-index:999;transition:opacity 0.4s ease-in-out;display:${isDarkTheme ? 'flex' : 'none'};align-items:center;justify-content:center;color:var(--text-muted);pointer-events:none;opacity:${isDarkTheme ? '1' : '0'};`;
    coverEl.createEl('span', { text: 'Loading...' });
    this.coverEl = coverEl;

    // ★ Star: save current URL to Chrome profile bookmarks
    const updateStarState = () => {
      const url = this.currentUrl;
      const bpath = getRealBookmarksPath(this.plugin);
      if (!url || !bpath) {
        starBtn.classList.remove('gview-star-saved');
        starBtn.title = 'Save bookmark';
        return;
      }
      try {
        const data = readChromeBookmarks(bpath);
        const roots = [data.roots.bookmark_bar, data.roots.other, data.roots.synced].filter(Boolean);
        let found = null;
        for (const r of roots) {
          found = findBookmarkInNode(r, url, this.plugin.settings.urlCleaningRules);
          if (found) break;
        }
        const isSaved = !!found;
        starBtn.classList.toggle('gview-star-saved', isSaved);
        starBtn.title = isSaved ? 'Edit bookmark' : 'Save bookmark';
      } catch {
        starBtn.classList.remove('gview-star-saved');
        starBtn.title = 'Save bookmark';
      }
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
      this.currentUrl = cleanGoogleUrl(currentSrc, this.plugin.settings.urlCleaningRules);

      urlText.textContent = this.currentUrl;
      urlText.title       = this.currentUrl;
      updateStarState();
      this.updateTabIcon();
      this.applyThemeToWebview();
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
      if (!url) return;
      const bpath = getRealBookmarksPath(this.plugin);
      if (!bpath) {
        new Notice('❌ Chrome bookmarks file not found. Set path in settings.');
        return;
      }

      try {
        const data = readChromeBookmarks(bpath);
        const roots = [data.roots.bookmark_bar, data.roots.other, data.roots.synced].filter(Boolean);
        let found = null;
        for (const r of roots) {
          found = findBookmarkInNode(r, url, this.plugin.settings.urlCleaningRules);
          if (found) break;
        }

        if (found) {
          // Open edit/remove modal
          new BookmarkEditModal(this.app, this.plugin, found, bpath, data, () => {
            updateStarState();
            // Refresh bookmarks view if it is open
            const leaves = this.app.workspace.getLeavesOfType('chrome-bookmarks');
            leaves.forEach(leaf => (leaf.view as any)?.loadAndRender?.());
          }).open();
        } else {
          // Add new bookmark to "Other bookmarks" (data.roots.other)
          if (!data.roots.other) {
            data.roots.other = {
              children: [],
              date_added: getChromeTimestamp(),
              date_modified: getChromeTimestamp(),
              id: '2',
              name: 'Other bookmarks',
              type: 'folder'
            };
          }
          if (!data.roots.other.children) {
            data.roots.other.children = [];
          }

          // Calculate new ID
          const maxId = getMaxIdInTree([data.roots.bookmark_bar, data.roots.other, data.roots.synced].filter(Boolean));
          const newId = (maxId + 1).toString();

          const title = this.currentTitle || url;
          const newBookmark = {
            date_added: getChromeTimestamp(),
            id: newId,
            name: title,
            type: 'url',
            url: url
          };

          data.roots.other.children.push(newBookmark);
          writeChromeBookmarks(bpath, data);
          new Notice(`★ Bookmarked to Chrome: ${title}`);
          updateStarState();

          // Refresh bookmarks view if it is open
          const leaves = this.app.workspace.getLeavesOfType('chrome-bookmarks');
          leaves.forEach(leaf => (leaf.view as any)?.loadAndRender?.());
        }
      } catch (e: any) {
        new Notice('❌ Failed to update bookmarks: ' + e.message);
      }
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
      this.updateTabIcon();
    });
    webview.addEventListener('did-start-loading', () => this.showLoadingCover());
    webview.addEventListener('load-commit', () => this.showLoadingCover());
    webview.addEventListener('did-navigate', updateNavBtns);
    webview.addEventListener('did-navigate-in-page', updateNavBtns);
    webview.addEventListener('did-finish-load', () => {
      updateNavBtns();
      setTimeout(() => this.hideLoadingCover(), 650);
    });
    webview.addEventListener('did-fail-load', () => {
      this.hideLoadingCover();
    });

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
    webview.addEventListener('dom-ready', () => {
      const css = `
        html.obsidian-dark-theme {
          filter: invert(0.9) hue-rotate(180deg) contrast(1.1);
          background-color: #121212 !important;
        }
        html.obsidian-dark-theme img,
        html.obsidian-dark-theme video,
        html.obsidian-dark-theme iframe,
        html.obsidian-dark-theme [style*="background-image"],
        html.obsidian-dark-theme [class*="favicon"] {
          filter: invert(1) hue-rotate(180deg);
        }
      `;
      (webview as any).insertCSS(css).then(() => {
        this.applyThemeToWebview();
        setTimeout(() => this.hideLoadingCover(), 650);
      }).catch(() => {
        this.hideLoadingCover();
      });
      updateNavBtns();
    });

    // Disable buttons until webview is ready
    backBtn.disabled = true;
    fwdBtn.disabled  = true;

    // Listen to Obsidian's theme changes
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        this.applyThemeToWebview();
      })
    );
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

    // Support both state.file (Obsidian default) and state.filePath (handleFileOpen)
    const stateFile = state?.file || state?.filePath;
    if (stateFile) {
      this.filePath = stateFile;
      const fileName = stateFile.split('/').pop() ?? stateFile;
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

    // Priority 2.5: View already has a URL loaded (file was renamed while tab was open).
    // Obsidian calls setState with the new path before firing vault.on('rename'), so the
    // cache migration hasn't happened yet. Reuse the current URL and cache it under the new path.
    if (this.currentUrl && this.currentUrl.startsWith('http')) {
      if (!this.plugin.settings.urlCache) this.plugin.settings.urlCache = {};
      this.plugin.settings.urlCache[this.filePath] = this.currentUrl;
      await this.plugin.saveSettings();
      // No need to call navigateTo again — webview is already showing the right page
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
    if (url) this.currentUrl = cleanGoogleUrl(url, this.plugin.settings.urlCleaningRules);
    if (title) this.currentTitle = title;
    if (filePath) this.filePath = filePath;
    if (this.webviewEl) (this.webviewEl as any).src = this.currentUrl;
    (this.leaf as any).updateHeader?.();
    this.updateTabIcon();
  }

  async onClose() {
    this.webviewEl?.remove();
    this.webviewEl = null;
    if (this.faviconObserver) {
      this.faviconObserver.disconnect();
      this.faviconObserver = null;
    }
  }

  private setupTabIconObserver() {
    if (this.faviconObserver) return;
    const leaf = this.leaf as any;
    if (leaf && leaf.tabHeaderEl) {
      const iconEl = leaf.tabHeaderEl.querySelector('.workspace-tab-header-inner-icon');
      if (iconEl) {
        this.faviconObserver = new MutationObserver(() => {
          const svg = iconEl.querySelector('svg');
          if (svg) {
            this.updateTabIcon();
          }
        });
        this.faviconObserver.observe(iconEl, { childList: true });
        this.register(() => {
          if (this.faviconObserver) {
            this.faviconObserver.disconnect();
            this.faviconObserver = null;
          }
        });
      }
    }
  }

  private updateTabIcon() {
    this.setupTabIconObserver();
    try {
      const leaf = this.leaf as any;
      if (!leaf || !leaf.tabHeaderEl) return;
      
      const iconEl = leaf.tabHeaderEl.querySelector('.workspace-tab-header-inner-icon');
      if (!iconEl) return;

      const color = getColorForRule(this.plugin, this.filePath, this.currentUrl);
      if (color) {
        let circle = iconEl.querySelector('.tab-color-circle') as HTMLElement;
        if (!circle) {
          iconEl.empty();
          circle = document.createElement('div');
          circle.className = 'tab-color-circle';
          circle.style.width = '14px';
          circle.style.height = '14px';
          circle.style.borderRadius = '50%';
          circle.style.display = 'inline-block';
          circle.style.verticalAlign = 'middle';
          circle.style.margin = 'auto';
          iconEl.appendChild(circle);
        }
        circle.style.backgroundColor = color;
        return;
      }

      if (!this.currentUrl || !this.currentUrl.startsWith('http')) {
        return;
      }

      const faviconUrl = getFaviconUrl(this.currentUrl);

      // If this favicon previously failed to load, don't try it again
      if (this.failedFavicons.has(faviconUrl)) {
        if (iconEl.querySelector('img.tab-favicon')) {
          this.faviconObserver?.disconnect();
          this.faviconObserver = null;
          (this.leaf as any).updateHeader?.();
          this.setupTabIconObserver();
        }
        return;
      }

      let img = iconEl.querySelector('img.tab-favicon') as HTMLImageElement;
      if (!img) {
        iconEl.empty();
        img = document.createElement('img');
        img.className = 'tab-favicon';
        img.style.width = '16px';
        img.style.height = '16px';
        img.style.verticalAlign = 'middle';
        
        img.onerror = () => {
          this.failedFavicons.add(faviconUrl);
          // Restore default SVG icon
          this.faviconObserver?.disconnect();
          this.faviconObserver = null;
          (this.leaf as any).updateHeader?.();
          this.setupTabIconObserver();
        };

        iconEl.appendChild(img);
      }
      if (img.src !== faviconUrl) {
        img.src = faviconUrl;
      }
    } catch (e) {
      // Fallback
    }
  }

  private applyThemeToWebview() {
    if (!this.webviewEl) return;
    const isDark = document.body.classList.contains('theme-dark');
    const script = `
      (function() {
        const html = document.documentElement;
        const body = document.body;
        
        function checkTheme() {
          const bg = window.getComputedStyle(body || html).backgroundColor;
          const match = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
          let isBgDark = false;
          if (match) {
            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);
            
            const aMatch = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)/);
            if (aMatch && parseFloat(aMatch[4]) === 0) {
              const htmlBg = window.getComputedStyle(html).backgroundColor;
              const htmlMatch = htmlBg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
              if (htmlMatch) {
                const hr = parseInt(htmlMatch[1], 10);
                const hg = parseInt(htmlMatch[2], 10);
                const hb = parseInt(htmlMatch[3], 10);
                isBgDark = (0.2126 * hr + 0.7152 * hg + 0.0722 * hb) < 120;
              }
            } else {
              isBgDark = (0.2126 * r + 0.7152 * g + 0.0722 * b) < 120;
            }
          }
          
          if (${isDark} && !isBgDark) {
            html.classList.add('obsidian-dark-theme');
          } else {
            html.classList.remove('obsidian-dark-theme');
          }
        }
        
        checkTheme();
        setTimeout(checkTheme, 500);
        setTimeout(checkTheme, 1500);
      })()
    `;
    try {
      (this.webviewEl as any).executeJavaScript(script).catch(() => {});
    } catch {}
  }

  private showLoadingCover() {
    if (this.coverEl) {
      const isDark = document.body.classList.contains('theme-dark');
      if (!isDark) {
        this.coverEl.style.display = 'none';
        this.coverEl.style.opacity = '0';
        return;
      }
      this.coverEl.style.display = 'flex';
      // Force reflow
      this.coverEl.offsetHeight;
      this.coverEl.style.opacity = '1';
    }
  }

  private hideLoadingCover() {
    if (this.coverEl) {
      this.coverEl.style.opacity = '0';
      setTimeout(() => {
        if (this.coverEl && this.coverEl.style.opacity === '0') {
          this.coverEl.style.display = 'none';
        }
      }, 400);
    }
  }
}

export function getColorForRule(plugin: any, filePath: string, url: string): string | null {
  const rules = plugin?.settings?.colorRules || [];
  if (rules.length === 0) return null;

  if (filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext) {
      const rule = rules.find((r: any) => r.extension.toLowerCase().trim() === ext);
      if (rule) return rule.color;
    }
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'docs.google.com') {
        let ext = '';
        if (parsed.pathname.startsWith('/document')) ext = 'gdoc';
        else if (parsed.pathname.startsWith('/spreadsheets')) ext = 'gsheet';
        else if (parsed.pathname.startsWith('/presentation')) ext = 'gslides';
        else if (parsed.pathname.startsWith('/forms')) ext = 'gform';
        else if (parsed.pathname.startsWith('/drawings')) ext = 'gdraw';
        
        if (ext) {
          const rule = rules.find((r: any) => r.extension.toLowerCase().trim() === ext);
          if (rule) return rule.color;
        }
      }
    } catch {}
  }

  return null;
}

export function getFaviconUrl(urlStr: string): string {
  if (!urlStr) return '';
  try {
    const url = new URL(urlStr);
    const host = url.hostname;
    const path = url.pathname;

    if (host === 'docs.google.com') {
      if (path.startsWith('/document')) {
        return 'https://ssl.gstatic.com/docs/documents/images/kix-favicon-2023q4.ico';
      }
      if (path.startsWith('/spreadsheets')) {
        return 'https://ssl.gstatic.com/docs/spreadsheets/images/favicon6.ico';
      }
      if (path.startsWith('/presentation')) {
        return 'https://www.google.com/s2/favicons?domain=slides.google.com&sz=16';
      }
      if (path.startsWith('/forms')) {
        return 'https://ssl.gstatic.com/docs/spreadsheets/forms-favicon.ico';
      }
    }
    if (host === 'drive.google.com') {
      return 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png';
    }

    return `https://www.google.com/s2/favicons?domain=${host}&sz=16`;
  } catch {
    return '';
  }
}

// ── Chrome Bookmarks Helpers ─────────────────────────────────────────────

export function getRealBookmarksPath(plugin: MyPlugin): string | null {
  const fs = require('fs') as typeof import('fs');
  if (plugin.settings.bookmarksPath) {
    try {
      if (fs.existsSync(plugin.settings.bookmarksPath)) {
        return plugin.settings.bookmarksPath;
      }
    } catch {}
  }

  const os   = require('os')   as typeof import('os');
  const path = require('path') as typeof import('path');
  const home = os.homedir();

  const candidates = [
    path.join(home, 'AppData', 'Local', 'Google', 'Chrome',       'User Data', 'Default', 'Bookmarks'),
    path.join(home, 'AppData', 'Local', 'Google', 'Chrome Beta',   'User Data', 'Default', 'Bookmarks'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge',       'User Data', 'Default', 'Bookmarks'),
    path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Bookmarks'), // macOS
  ];

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

export function getChromeTimestamp(): string {
  const microseconds = Date.now() * 1000 + 11644473600000000;
  return microseconds.toString();
}

export function readChromeBookmarks(filePath: string): any {
  const fs = require('fs') as typeof import('fs');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function writeChromeBookmarks(filePath: string, data: any) {
  const fs = require('fs') as typeof import('fs');
  // Remove the checksum key so Chrome recalculates it automatically
  delete data.checksum;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 3), 'utf8');
}

export function findMaxBookmarkId(node: any): number {
  let max = 0;
  const idNum = parseInt(node.id, 10);
  if (!isNaN(idNum) && idNum > max) {
    max = idNum;
  }
  if (node.children) {
    for (const child of node.children) {
      const childMax = findMaxBookmarkId(child);
      if (childMax > max) max = childMax;
    }
  }
  return max;
}

export function getMaxIdInTree(roots: any[]): number {
  let max = 0;
  for (const r of roots) {
    const rMax = findMaxBookmarkId(r);
    if (rMax > max) max = rMax;
  }
  return max;
}

export function removeBookmarkFromNode(node: any, url: string, rules?: UrlCleaningRule[]): boolean {
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type === 'url' && urlsMatch(child.url, url, rules)) {
        node.children.splice(i, 1);
        return true;
      }
      if (child.type === 'folder') {
        const deleted = removeBookmarkFromNode(child, url, rules);
        if (deleted) return true;
      }
    }
  }
  return false;
}

export function findBookmarkInNode(node: any, url: string, rules?: UrlCleaningRule[]): any | null {
  if (node.type === 'url' && urlsMatch(node.url, url, rules)) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findBookmarkInNode(child, url, rules);
      if (found) return found;
    }
  }
  return null;
}

export function findNodeAndParent(
  nodes: any[],
  id: string,
  parent: any = null
): { node: any; parent: any } | null {
  for (const node of nodes) {
    if (node.id === id) {
      return { node, parent };
    }
    if (node.children) {
      const found = findNodeAndParent(node.children, id, node);
      if (found) return found;
    }
  }
  return null;
}

export function isDescendant(parent: any, childId: string): boolean {
  if (!parent || !parent.children) return false;
  for (const child of parent.children) {
    if (child.id === childId) return true;
    if (child.type === 'folder' && isDescendant(child, childId)) return true;
  }
  return false;
}

export function moveBookmarkInTree(
  roots: any[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after' | 'inside'
): boolean {
  const draggedInfo = findNodeAndParent(roots, draggedId);
  if (!draggedInfo) return false;

  const targetInfo = findNodeAndParent(roots, targetId);
  if (!targetInfo) return false;

  // Validation:
  // 1. Root nodes cannot be dragged/moved (no parent)
  if (!draggedInfo.parent) return false;

  // 2. Cannot drop onto self
  if (draggedId === targetId) return false;

  // 3. Folder cannot be moved inside its own descendant
  if (draggedInfo.node.type === 'folder' && isDescendant(draggedInfo.node, targetId)) {
    return false;
  }

  // Remove from current parent
  if (draggedInfo.parent.children) {
    draggedInfo.parent.children = draggedInfo.parent.children.filter((c: any) => c.id !== draggedId);
  }

  const ts = getChromeTimestamp();
  draggedInfo.parent.date_modified = ts;

  if (position === 'inside') {
    if (targetInfo.node.type !== 'folder') return false;
    if (!targetInfo.node.children) targetInfo.node.children = [];
    targetInfo.node.children.push(draggedInfo.node);
    targetInfo.node.date_modified = ts;
  } else {
    // 'before' or 'after'
    if (!targetInfo.parent || !targetInfo.parent.children) return false;
    const idx = targetInfo.parent.children.findIndex((c: any) => c.id === targetId);
    if (idx === -1) return false;

    const insertIdx = position === 'before' ? idx : idx + 1;
    targetInfo.parent.children.splice(insertIdx, 0, draggedInfo.node);
    targetInfo.parent.date_modified = ts;
  }

  return true;
}

export function reconcileBookmarkTrees(diskRoots: any[], cachedRoots: any[]): any[] {
  const diskMap = new Map<string, any>();
  const cachedMap = new Map<string, any>();
  
  const getParentId = (roots: any[], nodeId: string): string | null => {
    const info = findNodeAndParent(roots, nodeId);
    return info && info.parent ? info.parent.id : null;
  };

  const traverse = (node: any, map: Map<string, any>) => {
    if (node && node.id) {
      map.set(node.id, node);
    }
    if (node && node.children) {
      for (const child of node.children) {
        traverse(child, map);
      }
    }
  };

  for (const r of diskRoots) traverse(r, diskMap);
  for (const r of cachedRoots) traverse(r, cachedMap);

  const cloneNodeShallow = (node: any) => {
    const clone = { ...node };
    if (clone.children) {
      clone.children = [];
    }
    return clone;
  };

  const reconstruct = (cachedNode: any): any | null => {
    const diskNode = diskMap.get(cachedNode.id);
    if (!diskNode && cachedNode.id !== '1' && cachedNode.id !== '2' && cachedNode.id !== '3') {
      return null;
    }

    const newNode = cloneNodeShallow(diskNode || cachedNode);
    if (diskNode) {
      newNode.name = diskNode.name;
      if (diskNode.url) newNode.url = diskNode.url;
    }

    if (cachedNode.children) {
      newNode.children = [];
      for (const child of cachedNode.children) {
        const reconChild = reconstruct(child);
        if (reconChild) {
          newNode.children.push(reconChild);
        }
      }
    }

    return newNode;
  };

  const mergedRoots = cachedRoots.map(r => reconstruct(r)).filter(Boolean);

  const newDiskNodes: any[] = [];
  diskMap.forEach((node, id) => {
    if (!cachedMap.has(id)) {
      const parentId = getParentId(diskRoots, id);
      if (!parentId || cachedMap.has(parentId)) {
        newDiskNodes.push(node);
      }
    }
  });

  const insertNodeIntoMerged = (roots: any[], nodeToInsert: any, parentId: string | null): boolean => {
    if (!parentId) return false;
    const parentInfo = findNodeAndParent(roots, parentId);
    if (parentInfo && parentInfo.node) {
      if (!parentInfo.node.children) parentInfo.node.children = [];
      if (!parentInfo.node.children.some((c: any) => c.id === nodeToInsert.id)) {
        parentInfo.node.children.push(JSON.parse(JSON.stringify(nodeToInsert)));
      }
      return true;
    }
    return false;
  };

  for (const node of newDiskNodes) {
    const parentId = getParentId(diskRoots, node.id);
    insertNodeIntoMerged(mergedRoots, node, parentId);
  }

  return mergedRoots;
}



export function mergeLocalBookmarksIntoChrome(data: any, localBookmarks: any[], rules?: UrlCleaningRule[]): boolean {
  if (!data || !data.roots) return false;
  if (!localBookmarks || localBookmarks.length === 0) return false;

  let modified = false;

  if (!data.roots.other) {
    data.roots.other = {
      children: [],
      date_added: getChromeTimestamp(),
      date_modified: getChromeTimestamp(),
      id: '2',
      name: 'Other bookmarks',
      type: 'folder'
    };
    modified = true;
  }
  if (!data.roots.other.children) {
    data.roots.other.children = [];
    modified = true;
  }

  const existsInNode = (node: any, url: string): boolean => {
    if (node.type === 'url' && urlsMatch(node.url, url, rules)) {
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        if (existsInNode(child, url)) return true;
      }
    }
    return false;
  };

  const roots = [data.roots.bookmark_bar, data.roots.other, data.roots.synced].filter(Boolean);

  for (const local of localBookmarks) {
    if (local.type === 'url' && local.url) {
      let alreadyExists = false;
      for (const r of roots) {
        if (existsInNode(r, local.url)) {
          alreadyExists = true;
          break;
        }
      }
      if (!alreadyExists) {
        const maxId = getMaxIdInTree(roots);
        const nextId = (maxId + 1).toString();
        const cloned = { ...local, id: nextId };
        data.roots.other.children.push(cloned);
        modified = true;
      }
    }
  }

  return modified;
}

// ── Bookmark Edit / Remove Modal ─────────────────────────────────────────

class BookmarkEditModal extends Modal {
  private bookmarkNode: any;
  private filePath: string;
  private data: any;
  private onSave: () => void;
  private plugin: MyPlugin;
  private nameInput = '';

  constructor(app: App, plugin: MyPlugin, bookmarkNode: any, filePath: string, data: any, onSave: () => void) {
    super(app);
    this.plugin = plugin;
    this.bookmarkNode = bookmarkNode;
    this.filePath = filePath;
    this.data = data;
    this.onSave = onSave;
    this.nameInput = bookmarkNode.name;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Edit bookmark' });

    let inputEl: HTMLInputElement;
    new Setting(contentEl)
      .setName('Name')
      .addText(text => {
        inputEl = text.inputEl;
        text.setValue(this.nameInput)
          .onChange(val => { this.nameInput = val; });
        text.inputEl.style.width = '100%';
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.save();
        });
      });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Save')
        .setCta()
        .onClick(() => this.save()))
      .addButton(btn => btn
        .setButtonText('Remove')
        .setWarning()
        .onClick(() => this.remove()))
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => this.close()));

    setTimeout(() => inputEl?.focus(), 50);
  }

  save() {
    this.bookmarkNode.name = this.nameInput.trim() || this.bookmarkNode.name;
    
    // Sync with localBookmarks settings cache
    const local = this.plugin.settings.localBookmarks || [];
    const localNode = local.find(item => item.url === this.bookmarkNode.url);
    if (localNode) {
      localNode.name = this.bookmarkNode.name;
    } else {
      local.push({ ...this.bookmarkNode });
    }
    this.plugin.saveSettings();

    writeChromeBookmarks(this.filePath, this.data);
    new Notice('Bookmark updated in Chrome');
    this.close();
    this.onSave();
  }

  remove() {
    const rules = this.plugin.settings.urlCleaningRules;
    
    // Sync with localBookmarks settings cache
    this.plugin.settings.localBookmarks = (this.plugin.settings.localBookmarks || []).filter(
      item => !urlsMatch(item.url, this.bookmarkNode.url, rules)
    );
    this.plugin.saveSettings();

    const roots = [this.data.roots.bookmark_bar, this.data.roots.other, this.data.roots.synced].filter(Boolean);
    for (const r of roots) {
      removeBookmarkFromNode(r, this.bookmarkNode.url, rules);
    }
    writeChromeBookmarks(this.filePath, this.data);
    new Notice('Bookmark removed from Chrome');
    this.close();
    this.onSave();
  }

  onClose() {
    this.contentEl.empty();
  }
}
