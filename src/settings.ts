import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import MyPlugin from './main';
import { disconnectGoogle, isGoogleConnected, startOAuthFlow } from './googleAuth';

export interface MyPluginSettings {
  mySetting: string;
  urlCache: Record<string, string>;   // vault path → Google URL
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
  }
}
