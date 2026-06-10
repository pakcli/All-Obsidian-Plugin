import { TextFileView, WorkspaceLeaf, type TFile } from "obsidian";
import { render, h } from "preact";
import { App } from "./components/App";
import TablitePlugin from "./main";
import { parseCSV } from "./parser/csv-engine";
import { detectEncoding, detectDelimiter } from "./parser/detect";

export const CSV_VIEW_TYPE = "tablite-csv-view";

export class CsvView extends TextFileView {
  private rootEl: HTMLDivElement | null = null;
  private plugin: TablitePlugin;
  private detectedEncoding = "utf-8";

  constructor(leaf: WorkspaceLeaf, plugin: TablitePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  async onLoadFile(file: TFile): Promise<void> {
    try {
      const buffer = await this.app.vault.readBinary(file);
      const encoding = detectEncoding(buffer);
      this.detectedEncoding = encoding;
      if (encoding !== "utf-8") {
        const decoder = new TextDecoder(encoding);
        this.data = decoder.decode(buffer);
      } else {
        this.data = await this.app.vault.read(file);
      }
    } catch (e) {
      console.error("tablite: encoding detection failed, falling back to UTF-8", e);
      this.data = await this.app.vault.read(file);
      this.detectedEncoding = "utf-8";
    }
    this.setViewData(this.data, true);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "CSV";
  }

  getIcon(): string {
    return "table";
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string, clear: boolean): void {
    this.data = data;
    this.renderApp();
  }

  clear(): void {
    this.data = "";
  }

  onOpen(): void {
    this.rootEl = this.contentEl.createDiv({ cls: "tablite-root" });
  }

  onClose(): void {
    if (this.rootEl) {
      render(null, this.rootEl);
    }
  }

  private renderApp(): void {
    if (!this.rootEl) return;
    const initialText = this.data ?? "";

    // Parse once here — App reuses this result instead of re-parsing
    const delimiter = initialText.trim().length > 0 ? detectDelimiter(initialText) : ",";
    const parsed = parseCSV(initialText, delimiter);
    const columnCount = parsed.headers.length > 0 ? parsed.headers.length : 1;
    const filePath = this.file?.path ?? "";

    render(
      h(App, {
        key: filePath,
        initialData: initialText,
        initialParsed: parsed,
        initialDelimiter: delimiter,
        initialEncoding: this.detectedEncoding,
        filePath,
        initialColumnConfig: this.plugin.getFileColumnConfig(filePath, columnCount),
        onColumnConfigChange: async (config, nextColumnCount) => {
          if (!filePath) return;
          await this.plugin.setFileColumnConfig(filePath, nextColumnCount, config);
        },
        onDataChange: (newData: string) => {
          this.data = newData;
          this.requestSave();
        },
      }),
      this.rootEl,
    );
  }
}
