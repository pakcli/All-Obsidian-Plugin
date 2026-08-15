import { App, Notice, TFile, Plugin, normalizePath } from 'obsidian';
import { DocmostApiClient } from './docmost-api';
import { DocmostConflictModal, ConflictResolutionChoice } from './ui/conflict-modal';

export class DocmostSyncManager {
  private app: App;
  private plugin: Plugin;
  private api: DocmostApiClient;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.api = new DocmostApiClient('http://localhost:3000');
  }

  setServer(url: string, token: string) {
    this.api = new DocmostApiClient(url, token);
  }

  async syncCurrentNote(spaceId: string) {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Docmost: No active file to sync.');
      return;
    }

    try {
      const localContent = await this.app.vault.read(file);
      const title = file.basename;

      const pages = await this.api.getPages(spaceId);
      const existingPage = pages.find((p) => p.title === title);

      if (existingPage) {
        const webContent = await this.api.getPageMarkdown(existingPage.id);

        if (webContent && webContent.trim() !== localContent.trim()) {
          // Open Conflict Modal to ask user
          new DocmostConflictModal(
            this.app,
            title,
            webContent,
            localContent,
            async (choice: ConflictResolutionChoice) => {
              if (choice === 'web') {
                await this.app.vault.modify(file, webContent);
                new Notice(`Docmost: Updated local file with Web version.`);
              } else if (choice === 'local') {
                await this.api.updatePage(existingPage.id, title, localContent);
                new Notice(`Docmost: Updated Web page with Local version.`);
              } else if (choice === 'both') {
                const copyName = normalizePath(`${file.parent?.path || ''}/${title} (Docmost Web).md`);
                await this.app.vault.create(copyName, webContent);
                await this.api.updatePage(existingPage.id, title, localContent);
                new Notice(`Docmost: Created duplicate web copy and updated Web page.`);
              }
            },
          ).open();
        } else {
          await this.api.updatePage(existingPage.id, title, localContent);
          new Notice(`Docmost: Updated page "${title}"`);
        }
      } else {
        await this.api.createPage(spaceId, title, localContent);
        new Notice(`Docmost: Created page "${title}"`);
      }
    } catch (err: any) {
      new Notice(`Docmost Sync error: ${err.message}`);
    }
  }

  async pullSpaceNotes(spaceId: string, targetSubfolder: string = '') {
    try {
      const pages = await this.api.getPages(spaceId);
      let count = 0;

      for (const pageSummary of pages) {
        const webContent = await this.api.getPageMarkdown(pageSummary.id);
        const safeTitle = pageSummary.title.replace(/[\\/?%*:|"<>]/g, '_');
        
        let targetPath = `${safeTitle}.md`;
        if (targetSubfolder) {
          targetPath = normalizePath(`${targetSubfolder}/${safeTitle}.md`);
        }

        const existingFile = this.app.vault.getAbstractFileByPath(targetPath);

        if (existingFile && existingFile instanceof TFile) {
          const localContent = await this.app.vault.read(existingFile);

          if (localContent.trim() !== webContent.trim()) {
            // Prompt conflict modal for each conflicting file
            await new Promise<void>((resolve) => {
              new DocmostConflictModal(
                this.app,
                pageSummary.title,
                webContent,
                localContent,
                async (choice: ConflictResolutionChoice) => {
                  if (choice === 'web') {
                    await this.app.vault.modify(existingFile, webContent);
                  } else if (choice === 'local') {
                    await this.api.updatePage(pageSummary.id, pageSummary.title, localContent);
                  } else if (choice === 'both') {
                    const copyPath = normalizePath(`${targetSubfolder}/${safeTitle} (Docmost Web).md`);
                    await this.app.vault.create(copyPath, webContent);
                  }
                  resolve();
                },
              ).open();
            });
          } else {
            await this.app.vault.modify(existingFile, webContent);
          }
        } else {
          await this.app.vault.create(targetPath, webContent);
        }
        count++;
      }

      new Notice(`Docmost: Pulled ${count} notes into vault folder "${targetSubfolder || 'root'}"!`);
    } catch (err: any) {
      new Notice(`Docmost Pull error: ${err.message}`);
    }
  }
}
