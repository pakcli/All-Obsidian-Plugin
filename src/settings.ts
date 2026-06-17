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

    containerEl.createEl("h3", { text: "Receipt Scanner Autocomplete Suggestions" });

    containerEl.createEl("p", {
      text: "Configure the source CSV files and columns used to populate autocomplete suggestions for Merchant and Category fields in the Receipt Scanner.",
      cls: "setting-item-description"
    });

    const tableDiv = containerEl.createDiv();
    tableDiv.style.display = "grid";
    tableDiv.style.gridTemplateColumns = "120px 1fr 150px";
    tableDiv.style.gap = "8px";
    tableDiv.style.alignItems = "center";
    tableDiv.style.margin = "12px 0";
    tableDiv.style.padding = "10px";
    tableDiv.style.border = "1px solid var(--background-modifier-border)";
    tableDiv.style.borderRadius = "6px";
    tableDiv.style.backgroundColor = "var(--background-secondary)";

    const createHeaderCell = (text: string) => {
      const el = tableDiv.createEl("div");
      el.style.fontWeight = "bold";
      el.style.borderBottom = "1px solid var(--background-modifier-border)";
      el.style.paddingBottom = "4px";
      el.setText(text);
    };
    createHeaderCell("Suggestion");
    createHeaderCell("CSV File Path");
    createHeaderCell("Column Name");

    // Merchant Row
    tableDiv.createEl("div", { text: "Merchant" });
    
    const inputMerchantPath = tableDiv.createEl("input", { type: "text" });
    inputMerchantPath.style.width = "100%";
    inputMerchantPath.value = this.plugin.settings.scannerMerchantPath || "";
    inputMerchantPath.placeholder = "e.g. Finance/merchants.csv";
    inputMerchantPath.addEventListener("change", async () => {
      this.plugin.settings.scannerMerchantPath = inputMerchantPath.value.trim();
      await this.plugin.saveSettings();
    });

    const inputMerchantCol = tableDiv.createEl("input", { type: "text" });
    inputMerchantCol.style.width = "100%";
    inputMerchantCol.value = this.plugin.settings.scannerMerchantCol || "";
    inputMerchantCol.placeholder = "e.g. merchant";
    inputMerchantCol.addEventListener("change", async () => {
      this.plugin.settings.scannerMerchantCol = inputMerchantCol.value.trim();
      await this.plugin.saveSettings();
    });

    // Category Row
    tableDiv.createEl("div", { text: "Category" });

    const inputCategoryPath = tableDiv.createEl("input", { type: "text" });
    inputCategoryPath.style.width = "100%";
    inputCategoryPath.value = this.plugin.settings.scannerCategoryPath || "";
    inputCategoryPath.placeholder = "e.g. Finance/budget.csv";
    inputCategoryPath.addEventListener("change", async () => {
      this.plugin.settings.scannerCategoryPath = inputCategoryPath.value.trim();
      await this.plugin.saveSettings();
    });

    const inputCategoryCol = tableDiv.createEl("input", { type: "text" });
    inputCategoryCol.style.width = "100%";
    inputCategoryCol.value = this.plugin.settings.scannerCategoryCol || "";
    inputCategoryCol.placeholder = "e.g. category";
    inputCategoryCol.addEventListener("change", async () => {
      this.plugin.settings.scannerCategoryCol = inputCategoryCol.value.trim();
      await this.plugin.saveSettings();
    });
  }
}
