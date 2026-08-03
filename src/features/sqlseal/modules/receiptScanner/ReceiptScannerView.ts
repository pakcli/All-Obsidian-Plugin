import { ItemView, WorkspaceLeaf } from "obsidian";
import { render, h } from "preact";
import { ReceiptScanner } from "./components/ReceiptScanner";
import TablitePlugin from "../../../../main";

export const RECEIPT_SCANNER_VIEW_TYPE = "receipt-scanner-view";

export class ReceiptScannerView extends ItemView {
  private plugin: TablitePlugin;
  private rootEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TablitePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return RECEIPT_SCANNER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Receipt Scanner";
  }

  getIcon(): string {
    return "receipt";
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: "receipt-scanner-root" });
    this.rootEl.style.height = "100%";
    this.rootEl.style.width = "100%";
    
    render(
      h(ReceiptScanner, {
        app: this.app,
        plugin: this.plugin,
        onClose: () => {
          this.app.workspace.detachLeavesOfType(RECEIPT_SCANNER_VIEW_TYPE);
        }
      }),
      this.rootEl
    );
  }

  async onClose(): Promise<void> {
    if (this.rootEl) {
      render(null, this.rootEl);
    }
  }
}
