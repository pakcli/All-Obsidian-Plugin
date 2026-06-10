import "./styles.css";
import {
  Modal,
  Notice,
  Plugin,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
} from "obsidian";
import { CsvView, CSV_VIEW_TYPE } from "./csv-view";
import {
  DEFAULT_PLUGIN_DATA,
  normalizeColumnConfig,
  type ColumnConfig,
  type TablitePluginData,
} from "./types";

class NewCsvModal extends Modal {
  private value: string;
  private onSubmit: (value: string) => Promise<void>;

  constructor(plugin: TablitePlugin, initialValue: string, onSubmit: (value: string) => Promise<void>) {
    super(plugin.app);
    this.value = initialValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "New CSV file" });

    new Setting(contentEl)
      .setName("File name")
      .setDesc("Enter a CSV file name")
      .addText((text) => {
        text
          .setPlaceholder("Untitled.csv")
          .setValue(this.value)
          .onChange((value) => {
            this.value = value;
          });
      });

    const actions = contentEl.createDiv({ cls: "tablite-modal-actions" });
    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    const createBtn = actions.createEl("button", {
      text: "Create",
      cls: "mod-cta",
    });

    const submit = async () => {
      await this.onSubmit(this.value);
    };

    cancelBtn.addEventListener("click", () => this.close());
    createBtn.addEventListener("click", () => {
      void submit();
    });

    const resolvedInputEl = contentEl.querySelector("input");
    if (resolvedInputEl) {
      resolvedInputEl.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void submit();
      });

      window.setTimeout(() => {
        resolvedInputEl.focus();
        resolvedInputEl.select();
      }, 0);
    }
  }
}

export default class TablitePlugin extends Plugin {
  private settings: TablitePluginData = DEFAULT_PLUGIN_DATA;

  async onload() {
    await this.loadSettings();
    await this.cleanupMissingFiles();

    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf, this));
    this.registerExtensions(["csv", "tsv"], CSV_VIEW_TYPE);
    this.addCommand({
      id: "create-new-csv",
      name: "Create new CSV file",
      callback: () => {
        this.createAndOpenCsv();
      },
    });

    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (!(file instanceof TFile)) return;
        if (!(file.extension === "csv" || file.extension === "tsv")) return;
        if (!this.settings.files[file.path]) return;
        delete this.settings.files[file.path];
        await this.saveSettings();
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        if (!(file.extension === "csv" || file.extension === "tsv")) return;
        const config = this.settings.files[oldPath];
        if (!config) return;
        this.settings.files[file.path] = config;
        delete this.settings.files[oldPath];
        await this.saveSettings();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        const targetFolder = this.resolveTargetFolder(file);
        if (!targetFolder) return;
        menu.addItem((item) =>
          item
            .setTitle("New CSV")
            .setIcon("spreadsheet")
            .onClick(() => {
              this.createAndOpenCsv(targetFolder);
            }),
        );
      }),
    );
  }

  onunload() {}

  getFileColumnConfig(filePath: string, columnCount: number): ColumnConfig {
    return normalizeColumnConfig(this.settings.files[filePath], columnCount);
  }

  async setFileColumnConfig(filePath: string, columnCount: number, config: ColumnConfig): Promise<void> {
    this.settings.files[filePath] = normalizeColumnConfig(config, columnCount);
    await this.saveSettings();
  }

  private async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_PLUGIN_DATA,
      ...(loaded ?? {}),
      files: {
        ...DEFAULT_PLUGIN_DATA.files,
        ...(loaded?.files ?? {}),
      },
    };
  }

  private async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async cleanupMissingFiles(): Promise<void> {
    let changed = false;
    for (const filePath of Object.keys(this.settings.files)) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file) continue;
      delete this.settings.files[filePath];
      changed = true;
    }
    if (changed) {
      await this.saveSettings();
    }
  }

  private resolveTargetFolder(file?: TAbstractFile | null): TFolder | null {
    if (file instanceof TFolder) return file;
    if (file instanceof TFile) return file.parent;
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile?.parent ?? this.app.vault.getRoot();
  }

  private createAndOpenCsv(targetFolder?: TFolder | null): void {
    const folder = targetFolder ?? this.resolveTargetFolder(null);
    const folderPath = folder?.path === "/" ? "" : (folder?.path ?? "");
    const defaultName = this.getAvailableCsvName(folderPath);

    const modal = new NewCsvModal(this, defaultName, async (rawValue) => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        new Notice("File name is required");
        return;
      }

      const finalName = trimmed.toLowerCase().endsWith(".csv") ? trimmed : `${trimmed}.csv`;
      const filePath = normalizePath(folderPath ? `${folderPath}/${finalName}` : finalName);
      if (this.app.vault.getAbstractFileByPath(filePath)) {
        new Notice("A file with that name already exists");
        return;
      }

      const file = await this.app.vault.create(filePath, "Column 1\n");
      await this.app.workspace.getLeaf(true).openFile(file);
      new Notice(`Created ${file.name}`);
      modal.close();
    });

    modal.open();
  }

  private getAvailableCsvName(folderPath: string): string {
    let index = 0;
    let name = "";
    do {
      name = index === 0 ? "Untitled.csv" : `Untitled ${index}.csv`;
      index += 1;
    } while (this.app.vault.getAbstractFileByPath(normalizePath(folderPath ? `${folderPath}/${name}` : name)));
    return name;
  }
}
