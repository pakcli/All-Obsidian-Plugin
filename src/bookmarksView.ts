import { ItemView, Notice, WorkspaceLeaf, Modal, Setting, Menu } from 'obsidian';
import type MyPlugin from './main';
import { GOOGLE_IFRAME_VIEW_TYPE, urlsMatch, cleanGoogleUrl, getRealBookmarksPath, mergeLocalBookmarksIntoChrome, writeChromeBookmarks, moveBookmarkInTree, reconcileBookmarkTrees, findNodeAndParent, getChromeTimestamp, getMaxIdInTree, getFaviconUrl } from './googleIframeView';

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

interface BookmarkActionModalOptions {
  action: 'add-bookmark' | 'add-folder' | 'edit-bookmark' | 'edit-folder';
  node?: BookmarkNode;
  onSubmit: (data: { name: string; url?: string }) => void;
  onDelete?: () => void;
}

class BookmarkActionModal extends Modal {
  private options: BookmarkActionModalOptions;
  private nameValue = '';
  private urlValue = '';

  constructor(app: any, options: BookmarkActionModalOptions) {
    super(app);
    this.options = options;
    this.nameValue = options.node?.name ?? '';
    this.urlValue = options.node?.url ?? '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    let titleText = '';
    switch (this.options.action) {
      case 'add-bookmark': titleText = 'Add bookmark'; break;
      case 'add-folder': titleText = 'Add folder'; break;
      case 'edit-bookmark': titleText = 'Edit bookmark'; break;
      case 'edit-folder': titleText = 'Edit folder'; break;
    }
    contentEl.createEl('h2', { text: titleText });

    let nameInputEl: HTMLInputElement;
    new Setting(contentEl)
      .setName('Name')
      .addText(text => {
        nameInputEl = text.inputEl;
        text.setValue(this.nameValue)
          .onChange(val => { this.nameValue = val; });
        text.inputEl.style.width = '100%';
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
        });
      });

    if (this.options.action === 'add-bookmark' || this.options.action === 'edit-bookmark') {
      new Setting(contentEl)
        .setName('URL')
        .addText(text => {
          text.setValue(this.urlValue)
            .onChange(val => { this.urlValue = val; });
          text.inputEl.style.width = '100%';
          text.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submit();
          });
        });
    }

    const buttonsSetting = new Setting(contentEl);
    
    buttonsSetting.addButton(btn => btn
      .setButtonText(this.options.action.startsWith('edit') ? 'Save' : 'Add')
      .setCta()
      .onClick(() => this.submit()));

    if (this.options.action.startsWith('edit') && this.options.onDelete) {
      buttonsSetting.addButton(btn => btn
        .setButtonText('Delete')
        .setWarning()
        .onClick(() => {
          this.close();
          this.options.onDelete?.();
        }));
    }

    buttonsSetting.addButton(btn => btn
      .setButtonText('Cancel')
      .onClick(() => this.close()));

    setTimeout(() => {
      nameInputEl?.focus();
    }, 50);
  }

  private submit() {
    const name = this.nameValue.trim();
    if (!name) {
      new Notice('Name is required');
      return;
    }
    if (this.options.action === 'add-bookmark' || this.options.action === 'edit-bookmark') {
      const url = this.urlValue.trim();
      if (!url || !url.startsWith('http')) {
        new Notice('A valid HTTP/HTTPS URL is required');
        return;
      }
      this.close();
      this.options.onSubmit({ name, url });
    } else {
      this.close();
      this.options.onSubmit({ name });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class BookmarksView extends ItemView {
  private plugin: MyPlugin;
  private searchQuery = '';
  private isSearchOpen = false;
  private collapsedFolders = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private roots: BookmarkNode[] = [];
  private rawData: ChromeBookmarksFile | null = null;
  private draggedNodeId: string | null = null;
  private isWriting = false;

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
    return getRealBookmarksPath(this.plugin);
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

      // Merge local bookmarks cache into Chrome tree (helps avoid overwrite conflicts when Chrome is running)
      const modified = mergeLocalBookmarksIntoChrome(data, this.plugin.settings.localBookmarks || [], this.plugin.settings.urlCleaningRules);
      if (modified) {
        try {
          this.isWriting = true;
          writeChromeBookmarks(bookmarksPath, data);
          setTimeout(() => { this.isWriting = false; }, 1000);
        } catch (err) {
          this.isWriting = false;
          console.warn('[Bookmarks] Failed to write back merged bookmarks:', err);
        }
      }

      // Reconcile disk data with in-memory roots to handle Chrome overwrites
      if (this.roots && this.roots.length > 0) {
        const diskRoots = [
          data.roots.bookmark_bar,
          data.roots.other,
          data.roots.synced,
        ].filter((n): n is BookmarkNode => !!n);

        const reconciled = reconcileBookmarkTrees(diskRoots, this.roots);
        
        for (const rootNode of reconciled) {
          if (rootNode.id === '1') data.roots.bookmark_bar = rootNode;
          else if (rootNode.id === '2') data.roots.other = rootNode;
          else if (data.roots.synced && rootNode.id === data.roots.synced.id) data.roots.synced = rootNode;
        }

        try {
          this.isWriting = true;
          writeChromeBookmarks(bookmarksPath, data);
          setTimeout(() => { this.isWriting = false; }, 1000);
        } catch (err) {
          this.isWriting = false;
          console.warn('[Bookmarks] Failed to save reconciled bookmarks:', err);
        }
      }

      this.rawData = data;
      this.roots = [
        data.roots.bookmark_bar,
        data.roots.other,
        data.roots.synced,
      ].filter((n): n is BookmarkNode => !!n);
      roots = this.roots;
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

    const controls = topBar.createEl('div', { cls: 'bookmarks-topbar-controls' });

    // Search toggle button
    const searchToggleBtn = controls.createEl('button', {
      cls: 'bookmarks-icon-btn' + (this.isSearchOpen ? ' is-active' : ''),
      title: 'Search',
      text: '🔍'
    });

    const refreshBtn = controls.createEl('button', { cls: 'bookmarks-icon-btn', title: 'Refresh', text: '↻' });
    refreshBtn.addEventListener('click', () => this.loadAndRender());

    // ── Search ───────────────────────────────────────────────────────────
    const searchWrap = container.createEl('div', {
      cls: 'bookmarks-search-wrap' + (this.isSearchOpen ? '' : ' is-hidden')
    });
    const searchInput = searchWrap.createEl('input', { cls: 'bookmarks-search', type: 'text' });
    searchInput.placeholder = 'Search bookmarks…';
    searchInput.value = this.searchQuery;

    const performSearch = () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      treeEl.empty();
      this.renderTree(treeEl, roots, this.searchQuery, null);
    };

    searchInput.addEventListener('input', performSearch);

    searchToggleBtn.addEventListener('click', () => {
      this.isSearchOpen = !this.isSearchOpen;
      searchToggleBtn.toggleClass('is-active', this.isSearchOpen);
      searchWrap.toggleClass('is-hidden', !this.isSearchOpen);
      if (this.isSearchOpen) {
        searchInput.focus();
      } else {
        searchInput.value = '';
        performSearch();
      }
    });

    // ── Tree ─────────────────────────────────────────────────────────────
    const treeEl = container.createEl('div', { cls: 'bookmarks-tree' });
    this.renderTree(treeEl, roots, this.searchQuery, null);
  }

  private renderTree(container: HTMLElement, nodes: BookmarkNode[], query: string, parentNode: BookmarkNode | null) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (query && !this.folderMatchesQuery(node, query)) continue;
        this.renderFolder(container, node, query, parentNode);
      } else if (node.type === 'url') {
        if (query && !this.urlMatchesQuery(node, query)) continue;
        this.renderBookmarkItem(container, node, parentNode);
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

  private renderFolder(container: HTMLElement, node: BookmarkNode, query: string, parentNode: BookmarkNode | null) {
    const forceOpen = !!query;
    const isOpen = forceOpen || !this.collapsedFolders.has(node.id);

    const folderEl = container.createEl('div', { cls: 'bookmarks-folder' });

    const header = folderEl.createEl('div', { cls: 'bookmarks-folder-header' });
    const arrow  = header.createEl('span', { cls: 'bookmarks-arrow', text: isOpen ? '▾' : '▸' });
    header.createEl('span', { cls: 'bookmarks-folder-icon', text: '📁' });
    header.createEl('span', { cls: 'bookmarks-folder-name', text: node.name });

    // Actions container
    const actions = header.createEl('div', { cls: 'bookmarks-actions' });
    const addBmkBtn = actions.createEl('button', { cls: 'bookmarks-action-btn', title: 'Add bookmark', text: '🔖+' });
    addBmkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAddBookmark(node);
    });
    const addFldBtn = actions.createEl('button', { cls: 'bookmarks-action-btn', title: 'Add folder', text: '📁+' });
    addFldBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAddFolder(node);
    });
    if (node.id !== '1' && node.id !== '2' && node.id !== '3') {
      const editBtn = actions.createEl('button', { cls: 'bookmarks-action-btn', title: 'Edit/Rename folder', text: '✏️' });
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onEditFolder(node);
      });
    }

    // Context menu support
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle('Add bookmark')
          .setIcon('bookmark')
          .onClick(() => this.onAddBookmark(node))
      );
      menu.addItem((item) =>
        item
          .setTitle('Add folder')
          .setIcon('folder')
          .onClick(() => this.onAddFolder(node))
      );
      if (node.id !== '1' && node.id !== '2' && node.id !== '3') {
        menu.addSeparator();
        menu.addItem((item) =>
          item
            .setTitle('Edit folder')
            .setIcon('pencil')
            .onClick(() => this.onEditFolder(node))
        );
        menu.addItem((item) =>
          item
            .setTitle('Delete folder')
            .setIcon('trash')
            .onClick(() => this.onEditFolder(node))
        );
      }
      menu.showAtPosition({ x: e.clientX, y: e.clientY });
    });

    const childrenEl = folderEl.createEl('div', {
      cls: 'bookmarks-folder-children' + (isOpen ? '' : ' is-collapsed'),
    });

    this.renderTree(childrenEl, node.children ?? [], query, node);

    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.bookmarks-actions')) return;
      if (forceOpen) return;
      const nowOpen = childrenEl.hasClass('is-collapsed');
      if (nowOpen) { this.collapsedFolders.delete(node.id); }
      else          { this.collapsedFolders.add(node.id); }
      childrenEl.toggleClass('is-collapsed', !nowOpen);
      arrow.textContent = nowOpen ? '▾' : '▸';
    });

    // Drag and drop implementation for folders
    const isRoot = !parentNode;
    if (!isRoot) {
      header.setAttribute('draggable', 'true');
      header.addEventListener('dragstart', (e) => {
        this.draggedNodeId = node.id;
        header.addClass('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', node.id);
          e.dataTransfer.effectAllowed = 'move';
        }
        e.stopPropagation();
      });
      header.addEventListener('dragend', (e) => {
        header.removeClass('is-dragging');
        this.draggedNodeId = null;
        e.stopPropagation();
      });
    }

    header.addEventListener('dragover', (e) => {
      if (!this.draggedNodeId || this.draggedNodeId === node.id) return;
      
      const draggedNode = this.findNodeById(this.roots, this.draggedNodeId);
      if (draggedNode && draggedNode.type === 'folder' && this.isDescendantNode(draggedNode, node.id)) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      
      const rect = header.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const pctY = relY / rect.height;
      
      if (isRoot) {
        header.addClass('drag-over-inside');
        header.removeClass('drag-over-top');
        header.removeClass('drag-over-bottom');
      } else {
        if (pctY < 0.25) {
          header.addClass('drag-over-top');
          header.removeClass('drag-over-bottom');
          header.removeClass('drag-over-inside');
        } else if (pctY > 0.75) {
          header.addClass('drag-over-bottom');
          header.removeClass('drag-over-top');
          header.removeClass('drag-over-inside');
        } else {
          header.addClass('drag-over-inside');
          header.removeClass('drag-over-top');
          header.removeClass('drag-over-bottom');
        }
      }
    });

    header.addEventListener('dragleave', (e) => {
      header.removeClass('drag-over-top');
      header.removeClass('drag-over-bottom');
      header.removeClass('drag-over-inside');
      e.stopPropagation();
    });

    header.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      header.removeClass('drag-over-top');
      header.removeClass('drag-over-bottom');
      header.removeClass('drag-over-inside');
      
      if (!this.draggedNodeId || this.draggedNodeId === node.id) return;
      
      const rect = header.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const pctY = relY / rect.height;
      
      let position: 'before' | 'after' | 'inside' = 'inside';
      if (!isRoot) {
        if (pctY < 0.25) {
          position = 'before';
        } else if (pctY > 0.75) {
          position = 'after';
        }
      }
      
      this.handleNodeMove(this.draggedNodeId, node.id, position);
    });
  }

  private renderBookmarkItem(container: HTMLElement, node: BookmarkNode, parentNode: BookmarkNode | null) {
    const item = container.createEl('div', { cls: 'bookmarks-item' });
    item.title = node.url ?? '';

    // Favicon resolution
    const favicon = item.createEl('img', { cls: 'bookmarks-favicon' });
    try {
      favicon.src = getFaviconUrl(node.url ?? '');
    } catch { favicon.style.display = 'none'; }
    favicon.onerror = () => { favicon.style.display = 'none'; };

    item.createEl('span', { cls: 'bookmarks-item-name', text: node.name });

    // Actions container
    const actions = item.createEl('div', { cls: 'bookmarks-actions' });
    const editBtn = actions.createEl('button', { cls: 'bookmarks-action-btn', title: 'Edit/Rename bookmark', text: '✏️' });
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onEditBookmark(node);
    });

    // Context menu support
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle('Edit bookmark')
          .setIcon('pencil')
          .onClick(() => this.onEditBookmark(node))
      );
      menu.addItem((item) =>
        item
          .setTitle('Delete bookmark')
          .setIcon('trash')
          .onClick(() => this.onEditBookmark(node))
      );
      menu.showAtPosition({ x: e.clientX, y: e.clientY });
    });

    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.bookmarks-actions')) return;
      this.openUrl(node.url ?? '', node.name);
    });

    // Drag and drop implementation for bookmark items
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', (e) => {
      this.draggedNodeId = node.id;
      item.addClass('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = 'move';
      }
      e.stopPropagation();
    });
    item.addEventListener('dragend', (e) => {
      item.removeClass('is-dragging');
      this.draggedNodeId = null;
      e.stopPropagation();
    });

    item.addEventListener('dragover', (e) => {
      if (!this.draggedNodeId || this.draggedNodeId === node.id) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      const rect = item.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const isTop = relY < rect.height / 2;
      
      item.toggleClass('drag-over-top', isTop);
      item.toggleClass('drag-over-bottom', !isTop);
    });

    item.addEventListener('dragleave', (e) => {
      item.removeClass('drag-over-top');
      item.removeClass('drag-over-bottom');
      e.stopPropagation();
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      item.removeClass('drag-over-top');
      item.removeClass('drag-over-bottom');
      
      if (!this.draggedNodeId || this.draggedNodeId === node.id) return;
      
      const rect = item.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const position = relY < rect.height / 2 ? 'before' : 'after';
      
      this.handleNodeMove(this.draggedNodeId, node.id, position);
    });
  }

  // ── Open URL in embedded webview ─────────────────────────────────────────

  private async openUrl(url: string, title: string) {
    if (!url) return;
    const cleanUrl = cleanGoogleUrl(url, this.plugin.settings.urlCleaningRules);

    // Reuse existing leaf with same URL
    const leaves = this.app.workspace.getLeavesOfType(GOOGLE_IFRAME_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as any;
      const currentUrl = (view && typeof view.getCurrentUrl === 'function')
        ? view.getCurrentUrl()
        : (leaf.getViewState()?.state as any)?.url;

      if (urlsMatch(currentUrl, cleanUrl, this.plugin.settings.urlCleaningRules)) {
        if (currentUrl !== cleanUrl && view && typeof view.navigateTo === 'function') {
          view.navigateTo(cleanUrl, title);
        }
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
        if (this.isWriting) return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.loadAndRender(), 800);
      });
      this.register(() => watcher.close());
    } catch (e) {
      console.warn('[Bookmarks] Could not watch file:', e);
    }
  }

  private findNodeById(nodes: BookmarkNode[], id: string): BookmarkNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private isDescendantNode(parent: BookmarkNode, childId: string): boolean {
    if (!parent.children) return false;
    for (const child of parent.children) {
      if (child.id === childId) return true;
      if (child.type === 'folder' && this.isDescendantNode(child, childId)) return true;
    }
    return false;
  }

  private async handleNodeMove(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') {
    const bookmarksPath = this.getBookmarksPath();
    if (!bookmarksPath || !this.rawData) return;

    const success = moveBookmarkInTree(this.roots, draggedId, targetId, position);
    if (success) {
      try {
        this.isWriting = true;
        writeChromeBookmarks(bookmarksPath, this.rawData);
        setTimeout(() => { this.isWriting = false; }, 1000);
        new Notice('Bookmarks reorganized');
        await this.loadAndRender();
      } catch (err) {
        this.isWriting = false;
        console.error('[Bookmarks] Failed to save reorganized bookmarks:', err);
        new Notice('❌ Failed to save bookmark changes');
      }
    }
  }

  private async saveBookmarksData() {
    const bookmarksPath = this.getBookmarksPath();
    if (!bookmarksPath || !this.rawData) return;
    try {
      this.isWriting = true;
      writeChromeBookmarks(bookmarksPath, this.rawData);
      setTimeout(() => { this.isWriting = false; }, 1000);
      await this.loadAndRender();
    } catch (err) {
      this.isWriting = false;
      console.error('[Bookmarks] Failed to save bookmarks:', err);
      new Notice('❌ Failed to save bookmark changes');
    }
  }

  private onAddBookmark(parentNode: BookmarkNode) {
    if (!this.rawData) return;
    new BookmarkActionModal(this.app, {
      action: 'add-bookmark',
      onSubmit: async (data) => {
        const roots = [this.rawData!.roots.bookmark_bar, this.rawData!.roots.other, this.rawData!.roots.synced].filter(Boolean);
        const parentInfo = findNodeAndParent(roots, parentNode.id);
        if (parentInfo && parentInfo.node) {
          const parent = parentInfo.node;
          if (!parent.children) parent.children = [];
          const maxId = getMaxIdInTree(roots);
          const newId = (maxId + 1).toString();
          const newBookmark: BookmarkNode = {
            id: newId,
            name: data.name,
            type: 'url',
            url: data.url,
          };
          parent.children.push(newBookmark);
          await this.saveBookmarksData();
          new Notice(`Added bookmark: ${data.name}`);
        }
      }
    }).open();
  }

  private onAddFolder(parentNode: BookmarkNode) {
    if (!this.rawData) return;
    new BookmarkActionModal(this.app, {
      action: 'add-folder',
      onSubmit: async (data) => {
        const roots = [this.rawData!.roots.bookmark_bar, this.rawData!.roots.other, this.rawData!.roots.synced].filter(Boolean);
        const parentInfo = findNodeAndParent(roots, parentNode.id);
        if (parentInfo && parentInfo.node) {
          const parent = parentInfo.node;
          if (!parent.children) parent.children = [];
          const maxId = getMaxIdInTree(roots);
          const newId = (maxId + 1).toString();
          const newFolder: BookmarkNode = {
            id: newId,
            name: data.name,
            type: 'folder',
            children: [],
          };
          parent.children.push(newFolder);
          await this.saveBookmarksData();
          new Notice(`Created folder: ${data.name}`);
        }
      }
    }).open();
  }

  private onEditFolder(node: BookmarkNode) {
    if (!this.rawData) return;
    if (node.id === '1' || node.id === '2' || node.id === '3') {
      new Notice('Root folders cannot be modified');
      return;
    }
    new BookmarkActionModal(this.app, {
      action: 'edit-folder',
      node,
      onSubmit: async (data) => {
        const roots = [this.rawData!.roots.bookmark_bar, this.rawData!.roots.other, this.rawData!.roots.synced].filter(Boolean);
        const nodeInfo = findNodeAndParent(roots, node.id);
        if (nodeInfo && nodeInfo.node) {
          nodeInfo.node.name = data.name;
          await this.saveBookmarksData();
          new Notice(`Renamed folder to: ${data.name}`);
        }
      },
      onDelete: async () => {
        const roots = [this.rawData!.roots.bookmark_bar, this.rawData!.roots.other, this.rawData!.roots.synced].filter(Boolean);
        const nodeInfo = findNodeAndParent(roots, node.id);
        if (nodeInfo && nodeInfo.parent) {
          nodeInfo.parent.children = nodeInfo.parent.children.filter((c: any) => c.id !== node.id);
          await this.saveBookmarksData();
          new Notice(`Deleted folder: ${node.name}`);
        }
      }
    }).open();
  }

  private onEditBookmark(node: BookmarkNode) {
    if (!this.rawData) return;
    new BookmarkActionModal(this.app, {
      action: 'edit-bookmark',
      node,
      onSubmit: async (data) => {
        const roots = [this.rawData!.roots.bookmark_bar, this.rawData!.roots.other, this.rawData!.roots.synced].filter(Boolean);
        const nodeInfo = findNodeAndParent(roots, node.id);
        if (nodeInfo && nodeInfo.node) {
          nodeInfo.node.name = data.name;
          nodeInfo.node.url = data.url;

          // Sync with localBookmarks settings cache
          const local = this.plugin.settings.localBookmarks || [];
          const localNode = local.find(item => item.url === node.url);
          if (localNode) {
            localNode.name = data.name;
            localNode.url = data.url;
          }
          await this.plugin.saveSettings();

          await this.saveBookmarksData();
          new Notice(`Updated bookmark: ${data.name}`);
        }
      },
      onDelete: async () => {
        const roots = [this.rawData!.roots.bookmark_bar, this.rawData!.roots.other, this.rawData!.roots.synced].filter(Boolean);
        const nodeInfo = findNodeAndParent(roots, node.id);
        if (nodeInfo && nodeInfo.parent) {
          // Sync with localBookmarks settings cache
          const rules = this.plugin.settings.urlCleaningRules;
          this.plugin.settings.localBookmarks = (this.plugin.settings.localBookmarks || []).filter(
            item => !urlsMatch(item.url, node.url ?? '', rules)
          );
          await this.plugin.saveSettings();

          nodeInfo.parent.children = nodeInfo.parent.children.filter((c: any) => c.id !== node.id);
          await this.saveBookmarksData();
          new Notice(`Deleted bookmark: ${node.name}`);
        }
      }
    }).open();
  }
}
