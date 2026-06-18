import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import MyPlugin from './main';
import { disconnectGoogle, isGoogleConnected, startOAuthFlow } from './googleAuth';
import { UrlCleaningRule } from './googleIframeView';

export interface FileColorRule {
  id: string;
  extension: string;
  color: string;
}

export interface MyPluginSettings {
  mySetting: string;
  urlCache: Record<string, string>;   // vault path → Google URL
  bookmarksPath: string;
  urlCleaningRules: UrlCleaningRule[];
  localBookmarks: any[];
  colorRules: FileColorRule[];
  showGoogleWorkspaceIcons: boolean;
  // Google OAuth2
  googleClientId: string;
  googleClientSecret: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
  urlCache: {},
  bookmarksPath: '',
  urlCleaningRules: [
    {
      id: 'default-notebooklm',
      domainPrefix: 'https://notebooklm.google.com/',
      suffix: 'pli=1',
    }
  ],
  localBookmarks: [],
  colorRules: [
    { id: '1', extension: 'gdoc', color: '#2b7de9' },
    { id: '2', extension: 'gsheet', color: '#0f9d58' },
    { id: '3', extension: 'gslides', color: '#f4b400' },
    { id: '4', extension: 'gform', color: '#724db6' },
    { id: '5', extension: 'gdraw', color: '#db4437' },
  ],
  showGoogleWorkspaceIcons: true,
  googleClientId: '',
  googleClientSecret: '',
  googleAccessToken: '',
  googleRefreshToken: '',
  googleTokenExpiry: 0,
};

export class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Google Drive OAuth ────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Google Drive integration' });
    containerEl.createEl('p', {
      text: 'Connect your Google account so .gdoc / .gsheet / .gslides files open '
          + 'automatically inside Obsidian — no URL copy-paste needed.',
      cls: 'setting-item-description',
    });

    // How-to link
    const howto = containerEl.createEl('p');
    howto.appendText('Setup: ');
    const link = howto.createEl('a', {
      text: 'Create OAuth credentials in Google Cloud Console',
      href: 'https://console.cloud.google.com/apis/credentials',
    });
    link.setAttr('target', '_blank');
    howto.appendText(
      ' → Create OAuth 2.0 Client ID (type: Desktop app) → copy Client ID and Secret below.'
    );

    new Setting(containerEl)
      .setName('Client ID')
      .setDesc('Paste the OAuth 2.0 Client ID from Google Cloud Console')
      .addText(text => text
        .setPlaceholder('xxxx.apps.googleusercontent.com')
        .setValue(this.plugin.settings.googleClientId)
        .onChange(async val => {
          this.plugin.settings.googleClientId = val.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Client secret')
      .setDesc('Paste the OAuth 2.0 Client Secret')
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('GOCSPX-…')
          .setValue(this.plugin.settings.googleClientSecret)
          .onChange(async val => {
            this.plugin.settings.googleClientSecret = val.trim();
            await this.plugin.saveSettings();
          });
      });

    // Status + connect/disconnect
    const connected = isGoogleConnected(this.plugin);
    new Setting(containerEl)
      .setName('Google account')
      .setDesc(connected ? '✅ Connected — files open automatically' : '❌ Not connected')
      .addButton(btn => {
        if (connected) {
          btn.setButtonText('Disconnect')
            .setWarning()
            .onClick(async () => {
              await disconnectGoogle(this.plugin);
              this.display(); // re-render
            });
        } else {
          btn.setButtonText('Connect Google account')
            .setCta()
            .onClick(async () => {
              try {
                await startOAuthFlow(this.plugin);
                this.display();
              } catch (e: any) {
                new Notice('❌ OAuth failed: ' + e.message);
              }
            });
        }
      });

    // ── URL Cache management ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Cached URLs' });
    const cache = this.plugin.settings.urlCache ?? {};
    const cacheEntries = Object.entries(cache);

    if (cacheEntries.length === 0) {
      containerEl.createEl('p', {
        text: 'No URLs cached yet.',
        cls: 'setting-item-description',
      });
    } else {
      cacheEntries.forEach(([filePath, url]) => {
        new Setting(containerEl)
          .setName(filePath)
          .setDesc(url.substring(0, 60) + '…')
          .addButton(btn => btn
            .setButtonText('Clear')
            .setWarning()
            .onClick(async () => {
              delete this.plugin.settings.urlCache[filePath];
              await this.plugin.saveSettings();
              this.display();
            }));
      });

      new Setting(containerEl)
        .addButton(btn => btn
          .setButtonText('Clear all cached URLs')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.urlCache = {};
            await this.plugin.saveSettings();
            this.display();
          }));
    }

    // ── Icon Color Themes ─────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Icon color themes' });

    new Setting(containerEl)
      .setName('Show Google Workspace icons')
      .setDesc('Show custom colored circle icons next to Google Drive files in the file explorer. If disabled, files will have no icons and titles will shift left.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showGoogleWorkspaceIcons !== false)
        .onChange(async (value) => {
          this.plugin.settings.showGoogleWorkspaceIcons = value;
          await this.plugin.saveSettings();
          this.plugin.refreshDynamicStyles();
        }));

    containerEl.createEl('p', {
      text: 'Customize background overlays for explorer icons and circles for tab headers.',
      cls: 'setting-item-description',
    });

    const rulesContainer = containerEl.createEl('div', { cls: 'color-rules-container' });
    
    // Header
    const headerRow = rulesContainer.createEl('div', { cls: 'color-rules-header-row' });
    headerRow.createEl('div', { cls: 'color-rule-header-col col-ext', text: 'File format' });
    headerRow.createEl('div', { cls: 'color-rule-header-col col-color-preview', text: 'Color' });
    headerRow.createEl('div', { cls: 'color-rule-header-col col-color-picker', text: 'Edit color' });
    headerRow.createEl('div', { cls: 'color-rule-header-col col-actions', text: 'Delete rule' });

    const colorRules = this.plugin.settings.colorRules ?? [];

    colorRules.forEach((rule, idx) => {
      const row = rulesContainer.createEl('div', { cls: 'color-rules-row' });

      // Extension Input
      const extCol = row.createEl('div', { cls: 'color-rule-col col-ext' });
      const extInput = extCol.createEl('input', { type: 'text' }) as HTMLInputElement;
      extInput.value = rule.extension;
      extInput.placeholder = 'e.g. gdoc';
      extInput.addEventListener('change', async () => {
        rule.extension = extInput.value.trim().toLowerCase();
        await this.plugin.saveSettings();
        this.plugin.refreshDynamicStyles();
        this.plugin.updateAllTabIcons();
      });

      // Color Preview
      const previewCol = row.createEl('div', { cls: 'color-rule-col col-color-preview' });
      const previewCircle = previewCol.createEl('div', { cls: 'color-preview-circle' });
      previewCircle.style.cssText = `width: 20px; height: 20px; border-radius: 50%; background-color: ${rule.color}; border: 1px solid var(--background-modifier-border);`;

      // Color Picker/Input
      const pickerCol = row.createEl('div', { cls: 'color-rule-col col-color-picker' });
      const pickerInput = pickerCol.createEl('input', { type: 'color' }) as HTMLInputElement;
      pickerInput.value = rule.color;
      pickerInput.style.cssText = 'width: 40px; height: 25px; padding: 0; border: none; cursor: pointer; background: none; margin-right: 8px;';
      
      const textInput = pickerCol.createEl('input', { type: 'text' }) as HTMLInputElement;
      textInput.value = rule.color;
      textInput.style.cssText = 'width: 80px;';

      const updateColor = async (newColor: string) => {
        rule.color = newColor;
        previewCircle.style.backgroundColor = newColor;
        pickerInput.value = newColor;
        textInput.value = newColor;
        await this.plugin.saveSettings();
        this.plugin.refreshDynamicStyles();
        this.plugin.updateAllTabIcons();
      };

      pickerInput.addEventListener('input', () => updateColor(pickerInput.value));
      textInput.addEventListener('change', () => {
        let val = textInput.value.trim();
        if (/^#[0-9A-F]{6}$/i.test(val)) {
          updateColor(val);
        } else {
          textInput.value = rule.color;
        }
      });

      // Actions (Delete)
      const actionsCol = row.createEl('div', { cls: 'color-rule-col col-actions' });
      const deleteBtn = actionsCol.createEl('button', { text: 'Delete', cls: 'mod-warning' });
      deleteBtn.addEventListener('click', async () => {
        this.plugin.settings.colorRules.splice(idx, 1);
        await this.plugin.saveSettings();
        this.plugin.refreshDynamicStyles();
        this.plugin.updateAllTabIcons();
        this.display(); // Re-render setting tab
      });
    });

    // Add Rule button
    const addRuleSetting = new Setting(containerEl)
      .addButton(btn => btn
        .setButtonText('Add Rule')
        .setCta()
        .onClick(async () => {
          if (!this.plugin.settings.colorRules) {
            this.plugin.settings.colorRules = [];
          }
          const nextId = (Date.now()).toString();
          this.plugin.settings.colorRules.push({
            id: nextId,
            extension: '',
            color: '#2b7de9'
          });
          await this.plugin.saveSettings();
          this.display(); // Re-render settings tab
        }));

    // ── Bookmarks integration ─────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Chrome / Edge bookmarks' });
    
    // Detect available bookmark profiles dynamically
    const profiles = detectBookmarkProfiles();
    const options: Record<string, string> = {};
    profiles.forEach(p => {
      options[p.path] = p.name;
    });
    options['custom'] = 'Custom path...';
    options[''] = 'Default (Auto-detect)';

    const currentPath = this.plugin.settings.bookmarksPath || '';
    const isCustom = currentPath !== '' && !options[currentPath];

    new Setting(containerEl)
      .setName('Browser profile')
      .setDesc('Select the browser profile to load bookmarks from')
      .addDropdown(dropdown => {
        dropdown.addOptions(options);
        dropdown.setValue(isCustom ? 'custom' : currentPath);
        dropdown.onChange(async (val) => {
          if (val === 'custom') {
            if (!isCustom) this.plugin.settings.bookmarksPath = '';
          } else {
            this.plugin.settings.bookmarksPath = val;
          }
          await this.plugin.saveSettings();
          this.display(); // re-render to show/hide custom path input
          
          // Trigger refresh of bookmarks view if open
          const leaves = this.app.workspace.getLeavesOfType('chrome-bookmarks');
          leaves.forEach(leaf => (leaf.view as any)?.loadAndRender?.());
        });
      });

    if (isCustom || currentPath === 'custom') {
      new Setting(containerEl)
        .setName('Custom Bookmarks path')
        .setDesc('Absolute path to your browser Bookmarks file')
        .addText(text => text
          .setPlaceholder('C:\\Users\\...\\Bookmarks')
          .setValue(isCustom ? this.plugin.settings.bookmarksPath : '')
          .onChange(async (val) => {
            this.plugin.settings.bookmarksPath = val.trim();
            await this.plugin.saveSettings();
            
            // Trigger refresh of bookmarks view if open
            const leaves = this.app.workspace.getLeavesOfType('chrome-bookmarks');
            leaves.forEach(leaf => (leaf.view as any)?.loadAndRender?.());
          }));
    }
  }
}

// ── Profile detector helper ─────────────────────────────────────────────
interface BookmarkProfile {
  name: string;
  path: string;
}

function detectBookmarkProfiles(): BookmarkProfile[] {
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');
  const home = os.homedir();

  const profiles: BookmarkProfile[] = [];

  const addIfExist = (displayName: string, p: string) => {
    try {
      if (fs.existsSync(p)) {
        profiles.push({ name: displayName, path: p });
      }
    } catch {}
  };

  // Google Chrome
  const chromeUserData = path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  try {
    if (fs.existsSync(chromeUserData)) {
      const dirs = fs.readdirSync(chromeUserData);
      for (const d of dirs) {
        if (d === 'Default' || d.startsWith('Profile ')) {
          const bp = path.join(chromeUserData, d, 'Bookmarks');
          addIfExist(`Chrome - ${d}`, bp);
        }
      }
    }
  } catch {}

  // Google Chrome Beta
  const chromeBetaUserData = path.join(home, 'AppData', 'Local', 'Google', 'Chrome Beta', 'User Data');
  try {
    if (fs.existsSync(chromeBetaUserData)) {
      const dirs = fs.readdirSync(chromeBetaUserData);
      for (const d of dirs) {
        if (d === 'Default' || d.startsWith('Profile ')) {
          const bp = path.join(chromeBetaUserData, d, 'Bookmarks');
          addIfExist(`Chrome Beta - ${d}`, bp);
        }
      }
    }
  } catch {}

  // Microsoft Edge
  const edgeUserData = path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');
  try {
    if (fs.existsSync(edgeUserData)) {
      const dirs = fs.readdirSync(edgeUserData);
      for (const d of dirs) {
        if (d === 'Default' || d.startsWith('Profile ')) {
          const bp = path.join(edgeUserData, d, 'Bookmarks');
          addIfExist(`Edge - ${d}`, bp);
        }
      }
    }
  } catch {}

  // macOS Chrome candidates
  const macChrome = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  try {
    if (fs.existsSync(macChrome)) {
      const dirs = fs.readdirSync(macChrome);
      for (const d of dirs) {
        if (d === 'Default' || d.startsWith('Profile ')) {
          const bp = path.join(macChrome, d, 'Bookmarks');
          addIfExist(`Chrome (Mac) - ${d}`, bp);
        }
      }
    }
  } catch {}

  return profiles;
}
