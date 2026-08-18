import { App, Modal } from "obsidian";

export class ConfirmReorderModal extends Modal {
  private titleText: string;
  private messageText: string;
  private onConfirm: () => void;
  private onCancel?: () => void;

  constructor(
    app: App,
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
  ) {
    super(app);
    this.titleText = title;
    this.messageText = message;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("tablite-confirm-modal");

    contentEl.createEl("h3", { text: this.titleText, cls: "tablite-confirm-title" });
    contentEl.createEl("p", { text: this.messageText, cls: "tablite-confirm-msg" });

    const btnContainer = contentEl.createDiv({ cls: "modal-button-container tablite-confirm-actions" });
    const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => {
      if (this.onCancel) this.onCancel();
      this.close();
    };

    const confirmBtn = btnContainer.createEl("button", {
      text: "Confirm Move",
      cls: "mod-cta",
    });
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
