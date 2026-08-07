import { PluginSettingTab, App, Plugin, Setting, Notice } from 'obsidian';
import { DocmostApiClient } from './docmost-api';

export interface DocmostSettings {
  docmostServerUrl: string;
  docmostEmail: string;
  docmostPassword: string;
  docmostToken: string;
  docmostSpaceId: string;
  docmostVaultSyncDir: string;
}

export const DEFAULT_DOCMOST_SETTINGS: DocmostSettings = {
  docmostServerUrl: 'http://localhost:3000',
  docmostEmail: '',
  docmostPassword: '',
  docmostToken: '',
  docmostSpaceId: '',
  docmostVaultSyncDir: '',
};

export class DocmostSettingsTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const plugin = this.plugin as any;

    new Setting(containerEl).setName('Docmost Sync Settings').setHeading();

    new Setting(containerEl)
      .setName('Docmost Server URL')
      .setDesc('Enter your Docmost server address (e.g. http://localhost:3000)')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:3000')
          .setValue(plugin.settings.docmostServerUrl)
          .onChange(async (value) => {
            plugin.settings.docmostServerUrl = value;
            await plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Email')
      .setDesc('Your Docmost user account email')
      .addText((text) =>
        text
          .setPlaceholder('user@example.com')
          .setValue(plugin.settings.docmostEmail)
          .onChange(async (value) => {
            plugin.settings.docmostEmail = value;
            await plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Password')
      .setDesc('Your Docmost account password')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('••••••••')
          .setValue(plugin.settings.docmostPassword)
          .onChange(async (value) => {
            plugin.settings.docmostPassword = value;
            await plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Authentication')
      .setDesc('Click to log in and retrieve Bearer token')
      .addButton((button) =>
        button.setButtonText('Log In & Test Connection').onClick(async () => {
          try {
            const client = new DocmostApiClient(
              plugin.settings.docmostServerUrl,
            );
            const token = await client.login(
              plugin.settings.docmostEmail,
              plugin.settings.docmostPassword,
            );
            plugin.settings.docmostToken = token;
            await plugin.saveSettings();
            new Notice('Docmost: Successfully authenticated!');
            this.display();
          } catch (err: any) {
            new Notice(`Docmost Auth Error: ${err.message}`);
          }
        }),
      );

    if (plugin.settings.docmostToken) {
      new Setting(containerEl)
        .setName('Space ID / Slug')
        .setDesc('Docmost Space ID to sync with this vault')
        .addText((text) =>
          text
            .setPlaceholder('e.g. general')
            .setValue(plugin.settings.docmostSpaceId)
            .onChange(async (value) => {
              plugin.settings.docmostSpaceId = value;
              await plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName('Target Local Vault Folder')
        .setDesc('Local folder inside your vault where space notes should be synced (e.g. Docmost/General)')
        .addText((text) =>
          text
            .setPlaceholder('Docmost/General')
            .setValue(plugin.settings.docmostVaultSyncDir || '')
            .onChange(async (value) => {
              plugin.settings.docmostVaultSyncDir = value;
              await plugin.saveSettings();
            }),
        );
    }
  }
}
