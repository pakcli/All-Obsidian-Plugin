import { App, PluginSettingTab, Setting } from "obsidian";
import TablitePlugin from "./main";

export class SampleSettingTab extends PluginSettingTab {
  plugin: TablitePlugin;

  constructor(app: App, plugin: TablitePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Tablite CSV Editor Settings" });

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Enable console logging and screen notifications (Notices) during file operations to help troubleshoot saving issues.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug)
          .onChange(async (value) => {
            this.plugin.settings.debug = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
