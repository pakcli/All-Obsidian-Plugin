import { ItemView, WorkspaceLeaf } from 'obsidian';
import type MyPlugin from './main';
import { GOOGLE_IFRAME_VIEW_TYPE, urlsMatch, cleanGoogleUrl } from './googleIframeView';

export const BOOKMARKS_VIEW_TYPE = 'chrome-bookmarks';

interface BookmarkNode {
  id: string;
  name: string;
  type: 'url' | 'folder';
  url?: string;
  children?: BookmarkNode[];
}

interface ChromeBookmarksFile {
  roots: {
    bookmark_bar: BookmarkNode;
    other: BookmarkNode;
    synced?: BookmarkNode;
  };
}

export default class BookmarksView extends ItemView {
  private plugin: MyPlugin;
  private searchQuery = '';
  private collapsedFolders = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType()    { return BOOKMARKS_VIEW_TYPE; }
  getDisplayText() { return 'Bookmarks'; }
  getIcon()        { return 'bookmark'; }

  async onOpen() {
    await this.loadAndRender();
    this.startWatcher();
  }

  async onClose() { /* cleanup via this.register() */ }

  // ── File path detection ───────────────────────────────────────────────────

  private getBookmarksPath(): string | null {
    const os   = require('os')   as typeof import('os');
    const path = require('path') as typeof import('path');
    const fs   = require('fs')   as typeof import('fs');
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

  // ── Load & render ─────────────────────────────────────────────────────────

  async loadAndRender() {
    const container = this.contentEl;
    container.empty();
    container.addClass('bookmarks-view');

    const bookmarksPath = this.getBookmarksPath();
    if (!bookmarksPath) {
      const msg = container.createEl('div', { cls: 'bookmarks-error' });
      msg.createEl('p', { text: '❌ Chrome/Edge Bookmarks file not found.' });
      msg.createEl('p', { text: 'Expected location:', cls: 'bookmarks-error-sub' });
      msg.createEl('code', { text: '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Bookmarks' });
      return;
    }

    let roots: BookmarkNode[];
    try {
      const fs = require('fs') as typeof import('fs');
      const raw = fs.readFileSync(bookmarksPath, 'utf8');
      const data: ChromeBookmarksFile = JSON.parse(raw);
      roots = [
        data.roots.bookmark_bar,
        data.roots.other,
        data.roots.synced,
      ].filter((n): n is BookmarkNode => !!n);
    } catch (e: any) {
      container.createEl('p', { text: '❌ Error reading bookmarks: ' + e.message, cls: 'bookmarks-error' });
      return;
    }

    this.renderShell(container, roots);
  }

  private renderShell(container: HTMLElement, roots: BookmarkNode[]) {
    // ── Top bar ──────────────────────────────────────────────────────────
    const topBar = container.createEl('div', { cls: 'bookmarks-topbar' });
    topBar.createEl('span', { cls: 'bookmarks-title', text: 'Bookmarks' });
    const refreshBtn = topBar.createEl('button', { cls: 'bookmarks-icon-btn', title: 'Refresh', text: '↻' });
    refreshBtn.addEventListener('click', () => this.loadAndRender());

    // ── Search ───────────────────────────────────────────────────────────
    const searchWrap = container.createEl('div', { cls: 'bookmarks-search-wrap' });
    const searchInput = searchWrap.createEl('input', { cls: 'bookmarks-search', type: 'text' });
    searchInput.placeholder = 'Search bookmarks…';
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      treeEl.empty();
      this.renderTree(treeEl, roots, this.searchQuery);
    });

    // ── Tree ─────────────────────────────────────────────────────────────
    const treeEl = container.createEl('div', { cls: 'bookmarks-tree' });
    this.renderTree(treeEl, roots, this.searchQuery);
  }

  private renderTree(container: HTMLElement, nodes: BookmarkNode[], query: string) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (query && !this.folderMatchesQuery(node, query)) continue;
        this.renderFolder(container, node, query);
      } else if (node.type === 'url') {
        if (query && !this.urlMatchesQuery(node, query)) continue;
        this.renderBookmarkItem(container, node);
      }
    }
  }

  private urlMatchesQuery(node: BookmarkNode, q: string): boolean {
    return node.name.toLowerCase().includes(q) || (node.url ?? '').toLowerCase().includes(q);
  }

  private folderMatchesQuery(node: BookmarkNode, q: string): boolean {
    if (node.name.toLowerCase().includes(q)) return true;
    return (node.children ?? []).some(c =>
      c.type === 'url' ? this.urlMatchesQuery(c, q) : this.folderMatchesQuery(c, q)
    );
  }

  private renderFolder(container: HTMLElement, node: BookmarkNode, query: string) {
    const forceOpen = !!query;
    const isOpen = forceOpen || !this.collapsedFolders.has(node.id);

    const folderEl = container.createEl('div', { cls: 'bookmarks-folder' });

    const header = folderEl.createEl('div', { cls: 'bookmarks-folder-header' });
    const arrow  = header.createEl('span', { cls: 'bookmarks-arrow', text: isOpen ? '▾' : '▸' });
    header.createEl('span', { cls: 'bookmarks-folder-icon', text: '📁' });
    header.createEl('span', { cls: 'bookmarks-folder-name', text: node.name });

    const childrenEl = folderEl.createEl('div', {
      cls: 'bookmarks-folder-children' + (isOpen ? '' : ' is-collapsed'),
    });

    this.renderTree(childrenEl, node.children ?? [], query);

    header.addEventListener('click', () => {
      if (forceOpen) return;
      const nowOpen = childrenEl.hasClass('is-collapsed');
      if (nowOpen) { this.collapsedFolders.delete(node.id); }
      else          { this.collapsedFolders.add(node.id); }
      childrenEl.toggleClass('is-collapsed', !nowOpen);
      arrow.textContent = nowOpen ? '▾' : '▸';
    });
  }

  private renderBookmarkItem(container: HTMLElement, node: BookmarkNode) {
    const item = container.createEl('div', { cls: 'bookmarks-item' });
    item.title = node.url ?? '';

    // Favicon via Google's favicon service
    const favicon = item.createEl('img', { cls: 'bookmarks-favicon' });
    try {
      const host = new URL(node.url ?? '').hostname;
      favicon.src = `https://www.google.com/s2/favicons?domain=${host}&sz=16`;
    } catch { favicon.style.display = 'none'; }
    favicon.onerror = () => { favicon.style.display = 'none'; };

    item.createEl('span', { cls: 'bookmarks-item-name', text: node.name });

    item.addEventListener('click', () => this.openUrl(node.url ?? '', node.name));
  }

  // ── Open URL in embedded webview ─────────────────────────────────────────

  private async openUrl(url: string, title: string) {
    if (!url) return;
    const cleanUrl = cleanGoogleUrl(url);

    // Reuse existing leaf with same URL
    const leaves = this.app.workspace.getLeavesOfType(GOOGLE_IFRAME_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as any;
      const currentUrl = (view && typeof view.getCurrentUrl === 'function')
        ? view.getCurrentUrl()
        : (leaf.getViewState()?.state as any)?.url;

      if (urlsMatch(currentUrl, cleanUrl)) {
        this.app.workspace.revealLeaf(leaf);
        return;
      }
    }

    // Open new tab
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({
      type: GOOGLE_IFRAME_VIEW_TYPE,
      state: { url: cleanUrl, title, file: '' },
    });
    this.app.workspace.revealLeaf(leaf);
  }

  // ── Auto-refresh when Chrome writes bookmarks ─────────────────────────────

  private startWatcher() {
    const p = this.getBookmarksPath();
    if (!p) return;

    try {
      const fs = require('fs') as typeof import('fs');
      const watcher = fs.watch(p, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.loadAndRender(), 800);
      });
      this.register(() => watcher.close());
    } catch (e) {
      console.warn('[Bookmarks] Could not watch file:', e);
    }
  }
}
