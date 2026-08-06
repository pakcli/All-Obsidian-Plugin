import { App, Modal, ButtonComponent } from 'obsidian';

export type ConflictResolutionChoice = 'web' | 'local' | 'both';

export class DocmostConflictModal extends Modal {
  private fileTitle: string;
  private webContent: string;
  private localContent: string;
  private onResolve: (choice: ConflictResolutionChoice) => void;

  constructor(
    app: App,
    fileTitle: string,
    webContent: string,
    localContent: string,
    onResolve: (choice: ConflictResolutionChoice) => void,
  ) {
    super(app);
    this.fileTitle = fileTitle;
    this.webContent = webContent;
    this.localContent = localContent;
    this.onResolve = onResolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: `Sync Conflict: ${this.fileTitle}` });
    contentEl.createEl('p', {
      text: 'This note has different edits in Docmost Web and your local Obsidian vault. Select how to merge:',
    });

    const grid = contentEl.createDiv();
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '12px';
    grid.style.margin = '16px 0';

    const webBox = grid.createDiv();
    webBox.style.border = '1px solid var(--background-modifier-border)';
    webBox.style.padding = '10px';
    webBox.style.borderRadius = '6px';
    webBox.style.backgroundColor = 'var(--background-secondary)';
    webBox.createEl('h4', { text: '🌐 Docmost Web Version' });
    const webPre = webBox.createEl('pre', {
      text: this.webContent.slice(0, 400) + (this.webContent.length > 400 ? '...' : ''),
    });
    webPre.style.maxHeight = '140px';
    webPre.style.overflowY = 'auto';
    webPre.style.fontSize = '11px';

    const localBox = grid.createDiv();
    localBox.style.border = '1px solid var(--background-modifier-border)';
    localBox.style.padding = '10px';
    localBox.style.borderRadius = '6px';
    localBox.style.backgroundColor = 'var(--background-secondary)';
    localBox.createEl('h4', { text: '💻 Local Obsidian Version' });
    const localPre = localBox.createEl('pre', {
      text: this.localContent.slice(0, 400) + (this.localContent.length > 400 ? '...' : ''),
    });
    localPre.style.maxHeight = '140px';
    localPre.style.overflowY = 'auto';
    localPre.style.fontSize = '11px';

    const btnContainer = contentEl.createDiv();
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.marginTop = '16px';

    new ButtonComponent(btnContainer)
      .setButtonText('🌐 Use Web Version')
      .setCta()
      .onClick(() => {
        this.onResolve('web');
        this.close();
      });

    new ButtonComponent(btnContainer)
      .setButtonText('💻 Use Local Version')
      .onClick(() => {
        this.onResolve('local');
        this.close();
      });

    new ButtonComponent(btnContainer)
      .setButtonText('🔀 Keep Both (Copy)')
      .onClick(() => {
        this.onResolve('both');
        this.close();
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
