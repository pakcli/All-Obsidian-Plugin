import { App, Modal, Setting, TFile } from "obsidian";

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

export function formatHeaderName(name: string): string {
  if (!name) return "";
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Handles camelCase
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export interface AutocompleteColConfig {
  column: string;
  replacementEnabled: boolean;
  replacement: string;
  wikilinkEnabled: boolean;
}

export function parseAutocompleteSettings(settingStr: string): {
  columns: string[];
  replacements: Record<string, string>;
  configs: AutocompleteColConfig[];
} {
  const columns: string[] = [];
  const replacements: Record<string, string> = {};
  const configs: AutocompleteColConfig[] = [];

  if (!settingStr) {
    return { columns, replacements, configs };
  }

  const trimmed = settingStr.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.column) {
            const col = item.column.trim();
            const colLower = col.toLowerCase();
            const repEnabled = item.replacementEnabled !== false;
            const rep = (item.replacement || "").trim();
            const wikiEnabled = item.wikilinkEnabled !== false;

            if (wikiEnabled) {
              columns.push(colLower);
            }
            if (repEnabled) {
              replacements[colLower] = rep || formatHeaderName(col);
            }
            configs.push({
              column: col,
              replacementEnabled: repEnabled,
              replacement: rep,
              wikilinkEnabled: wikiEnabled
            });
          }
        }
        return { columns, replacements, configs };
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const [col, rep] of Object.entries(parsed)) {
          const colTrimmed = col.trim();
          const colLower = colTrimmed.toLowerCase();
          const repStr = typeof rep === 'string' ? rep.trim() : "";
          columns.push(colLower);
          replacements[colLower] = repStr || formatHeaderName(colTrimmed);
          configs.push({
            column: colTrimmed,
            replacementEnabled: true,
            replacement: repStr,
            wikilinkEnabled: true
          });
        }
        return { columns, replacements, configs };
      }
    } catch (e) {
      console.error("Failed to parse autocomplete columns settings as JSON", e);
    }
  }

  // Fallback to legacy comma-separated string
  const legacyCols = settingStr.split(',').map((s) => s.trim()).filter(Boolean);
  for (const col of legacyCols) {
    const colLower = col.toLowerCase();
    columns.push(colLower);
    const rep = formatHeaderName(col);
    replacements[colLower] = rep;
    configs.push({
      column: col,
      replacementEnabled: true,
      replacement: rep,
      wikilinkEnabled: true
    });
  }

  return { columns, replacements, configs };
}

export function resolveHeaderName(name: string, settingStr: string): string {
  if (!name) return "";
  const { replacements } = parseAutocompleteSettings(settingStr);
  const lower = name.toLowerCase();
  if (lower in replacements) {
    return replacements[lower] || name;
  }
  return name;
}
