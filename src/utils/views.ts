import { App, Modal, Setting, TFile, TFolder } from "obsidian";

export function getArtifactPath(csvPath: string): string {
  const withoutExt = csvPath.substring(0, csvPath.lastIndexOf('.')) || csvPath;
  return `csv_view_artifacts/${withoutExt}.json`;
}

export async function ensureFolderExists(app: App, folderPath: string) {
  const parts = folderPath.split('/');
  let current = '';
  for (const part of parts) {
    if (!part) continue;
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getFolderByPath(current)) {
      await app.vault.createFolder(current).catch(() => {});
    }
  }
}

export async function handleArtifactRename(app: App, oldPath: string, newPath: string) {
  const oldArtifactPath = getArtifactPath(oldPath);
  const oldArtifactFile = app.vault.getFileByPath(oldArtifactPath);
  if (oldArtifactFile instanceof TFile) {
    const newArtifactPath = getArtifactPath(newPath);
    const parentIndex = newArtifactPath.lastIndexOf('/');
    if (parentIndex !== -1) {
      const parentPath = newArtifactPath.substring(0, parentIndex);
      await ensureFolderExists(app, parentPath);
    }
    await app.vault.rename(oldArtifactFile, newArtifactPath);
  }
}

export class PromptModal extends Modal {
  private value: string = "";
  private onSubmit: (value: string) => void;

  constructor(
    app: App,
    private titleText: string,
    private placeholder: string,
    defaultValue: string,
    onSubmit: (value: string) => void
  ) {
    super(app);
    this.value = defaultValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.titleText });

    new Setting(contentEl)
      .addText((text) => {
        text
          .setPlaceholder(this.placeholder)
          .setValue(this.value)
          .onChange((val) => {
            this.value = val;
          });
        
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.onSubmit(this.value);
            this.close();
          }
        });

        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = buttonContainer.createEl("button", { text: "Submit", cls: "mod-cta" });
    submitBtn.addEventListener("click", () => {
      this.onSubmit(this.value);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
