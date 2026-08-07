import { App, Modal, Setting, Notice } from 'obsidian';
import TreeNode from '../models/TreeNode';

export class CreateStructureModal extends Modal {
	private trees: TreeNode[];
	private targetPath: string = "";
	private leafMode: 'file' | 'folder' = 'file';

	constructor(app: App, trees: TreeNode[], defaultPath: string) {
		super(app);
		this.trees = trees;
		this.targetPath = defaultPath;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl("h2", { text: "Create folder structure" });
		contentEl.createEl("p", { 
			text: "Create files and folders automatically based on the tree diagram. Existing files and folders will not be overwritten.",
			cls: "setting-item-description"
		});

		new Setting(contentEl)
			.setName("Target folder path")
			.setDesc("The parent folder where the structure will be created (leave empty for vault root)")
			.addText(text => text
				.setPlaceholder("e.g. folder/subfolder")
				.setValue(this.targetPath)
				.onChange(value => {
					this.targetPath = value.trim();
				})
			);

		new Setting(contentEl)
			.setName("Leaf nodes")
			.setDesc("How to treat tree nodes that don't have any children")
			.addDropdown(dropdown => dropdown
				.addOption("file", "Create as Markdown Files (.md)")
				.addOption("folder", "Create as Folders")
				.setValue(this.leafMode)
				.onChange(value => {
					this.leafMode = value as 'file' | 'folder';
				})
			);

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		
		const createBtn = buttonContainer.createEl("button", {
			text: "Create",
			cls: "mod-cta"
		});
		
		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel"
		});

		cancelBtn.onclick = () => {
			this.close();
		};

		createBtn.onclick = async () => {
			createBtn.disabled = true;
			createBtn.textContent = "Creating...";
			
			try {
				const result = await this.generateStructure();
				new Notice(`Created ${result.foldersCreated} folders and ${result.filesCreated} files.`);
				if (result.errors.length > 0) {
					new Notice(`Some errors occurred. Check console for details.`, 5000);
					console.error("Structure creation errors:", result.errors);
				}
				this.close();
			} catch (err: unknown) {
				new Notice(`Failed to create structure: ${err instanceof Error ? err.message : String(err)}`);
				createBtn.disabled = false;
				createBtn.textContent = "Create";
			}
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async generateStructure() {
		let totalFilesCreated = 0;
		let totalFoldersCreated = 0;
		const allErrors: string[] = [];
		const vault = this.app.vault;

		// 1. Ensure target path folder exists
		let basePath = this.targetPath;
		// Clean leading/trailing slashes
		basePath = basePath.replace(/^\/+|\/+$/g, "");

		if (basePath) {
			const parts = basePath.split("/");
			let currentPath = "";
			for (const part of parts) {
				const sanitizedPart = this.sanitizeName(part);
				if (!sanitizedPart) continue;
				currentPath = currentPath ? `${currentPath}/${sanitizedPart}` : sanitizedPart;
				
				const existing = vault.getAbstractFileByPath(currentPath);
				if (!existing) {
					try {
						await vault.createFolder(currentPath);
						totalFoldersCreated++;
					} catch (e: unknown) {
						allErrors.push(`Failed to create base folder "${currentPath}": ${e instanceof Error ? e.message : String(e)}`);
						return { filesCreated: 0, foldersCreated: totalFoldersCreated, errors: allErrors };
					}
				}
			}
			basePath = currentPath;
		}

		// 2. Recursively create tree structure
		const createNode = async (node: TreeNode, parentPath: string) => {
			const cleanName = this.sanitizeName(node.link ? node.link.target : node.name);
			if (!cleanName) return;

			const currentPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
			const isLeaf = node.children.length === 0;

			if (isLeaf) {
				if (this.leafMode === 'file') {
					// Check if has extension, default to .md
					const hasExtension = /\.[a-zA-Z0-9]+$/.test(cleanName);
					const filePath = hasExtension ? currentPath : `${currentPath}.md`;

					const existing = vault.getAbstractFileByPath(filePath);
					if (!existing) {
						try {
							await vault.create(filePath, "");
							totalFilesCreated++;
						} catch (e: unknown) {
							allErrors.push(`Failed to create file "${filePath}": ${e instanceof Error ? e.message : String(e)}`);
						}
					}
				} else {
					const existing = vault.getAbstractFileByPath(currentPath);
					if (!existing) {
						try {
							await vault.createFolder(currentPath);
							totalFoldersCreated++;
						} catch (e: unknown) {
							allErrors.push(`Failed to create folder "${currentPath}": ${e instanceof Error ? e.message : String(e)}`);
						}
					}
				}
			} else {
				// Has children, must be folder
				const existing = vault.getAbstractFileByPath(currentPath);
				if (!existing) {
					try {
						await vault.createFolder(currentPath);
						totalFoldersCreated++;
					} catch (e: unknown) {
						allErrors.push(`Failed to create folder "${currentPath}": ${e instanceof Error ? e.message : String(e)}`);					}
				}

				for (const child of node.children) {
					await createNode(child, currentPath);
				}
			}
		};

		for (const tree of this.trees) {
			await createNode(tree, basePath);
		}

		return {
			filesCreated: totalFilesCreated,
			foldersCreated: totalFoldersCreated,
			errors: allErrors
		};
	}

	private sanitizeName(name: string): string {
		// Clean name from wikilink brackets and illegal filename characters in Obsidian
		// Illegal characters: * " \ / < > : | ?
		return name.replace(/[\[\]]/g, "").replace(/[*"\\\/<>:|?]/g, "").trim();
	}
}
