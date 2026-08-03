// SQLSeal codeblock query processor
import { OmnibusRegistrator } from "@hypersphere/omnibus";
import {
	App,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	Modal,
	Notice,
} from "obsidian";
import { resolveWikiLink } from "../../../utils/wiki";
import { parseAutocompleteSettings } from "../../../utils/views";
import { Sync } from "../../sync/sync/sync";
import { RendererRegistry, RenderReturn } from "../renderer/rendererRegistry";
import { ParserResult, parseWithDefaults, TableDefinition } from "../parser";
import { SqlocalDatabaseProxy } from "../../database/sqlocal/sqlocalDatabaseProxy";
import { displayError, displayNotice } from "../../../utils/ui";
import { transformQuery } from "../sql/sqlTransformer";
import { registerObservers } from "../../../utils/registerObservers";
import { Settings } from "../../settings/Settings";
import { ModernCellParser } from "../../syntaxHighlight/cellParser/ModernCellParser";

export class CodeblockProcessor extends MarkdownRenderChild {
	registrator: OmnibusRegistrator;
	renderer: RenderReturn;
	private flags: ParserResult["flags"];
	private extrasEl: HTMLElement;
	private explainEl: HTMLElement;

	private tables: TableDefinition[] = [];
	private isEditable = false;
	private targetTableAlias = "";
	private targetTableName = "";
	private targetSourcePath = "";
	private registeredTables: Record<string, string> = {};

	constructor(
		private el: HTMLElement,
		private source: string,
		private ctx: MarkdownPostProcessorContext,
		private rendererRegistry: RendererRegistry,
		private db: Pick<SqlocalDatabaseProxy, 'select' | 'explain' | 'updateData' | 'getColumns'>,
		private cellParser: ModernCellParser,
		private settings: Settings,
		private app: App,
		private sync: Sync,
		private tq: typeof transformQuery = transformQuery
	) {
		super(el);

		this.registrator = this.sync.getRegistrator();
	}

	query: string;

	async onload() {
		this.registerDomEvent(window, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Control' || e.key === 'Meta') {
				this.el.classList.add('sqlseal-ctrl-pressed');
			}
		});
		this.registerDomEvent(window, 'keyup', (e: KeyboardEvent) => {
			if (e.key === 'Control' || e.key === 'Meta') {
				this.el.classList.remove('sqlseal-ctrl-pressed');
			}
		});
		this.registerDomEvent(window, 'blur', () => {
			this.el.classList.remove('sqlseal-ctrl-pressed');
		});

		try {
			const defaults: ParserResult = {
				flags: {
					refresh: this.settings.get("enableDynamicUpdates"),
					explain: false,
				},
				query: "",
				renderer: {
					options: "",
					type: this.settings.get("defaultView").toUpperCase(),
				},
				tables: [],
			};

			const results = parseWithDefaults(
				this.source,
				this.rendererRegistry.getViewDefinitions(),
				defaults,
				this.rendererRegistry.flags,
			);

			this.tables = results.tables ?? [];
			if (results.tables) {
				await this.registerTables(results.tables);
				if (!results.query) {
					displayNotice(
						this.el,
						`Creating tables: ${results.tables.map((t) => t.tableAlias).join(", ")}`,
					);
					return;
				}
			}

			this.flags = results.flags;
			let rendererEl = this.el;

			if (this.flags.explain) {
				this.extrasEl = this.el.createDiv({ cls: "sqlseal-extras-container" });
				if (this.flags.explain) {
					this.explainEl = this.extrasEl.createEl("pre", {
						cls: "sqlseal-extras-explain-container",
					});
				}
				rendererEl = this.el.createDiv({ cls: "sqlseal-renderer-container" });
			}

            // IF WE'RE ON CANVAS, LETS ADD BACKGRUND
            if (this.isOnCanvas) {
                rendererEl.classList.add('sqlseal-renderer-on-canvas')
            }

			this.renderer = this.rendererRegistry.prepareRender(
				results.renderer.type.toLowerCase(),
				results.renderer.options,
			)(rendererEl, {
				cellParser: this.cellParser,
				sourcePath: this.sourceKey,
			});

			// FIXME: probably should save the one before transform and perform transform every time we execute it.
			this.query = results.query;
			await this.render();
		} catch (e) {
			displayError(this.el, e.toString());
		}
	}

	onunload() {
		this.registrator.offAll();
		if (this.renderer?.cleanup) {
			this.renderer.cleanup();
		}
	}

	async render() {
		try {
			const registeredTablesForContext =
				await this.sync.getTablesMappingForContext(this.sourceKey) as Record<string, string>;

			// Transforming Query
			const res = this.tq(this.query, registeredTablesForContext, {
				disableTagAutoDetection: this.settings.get('disableTagAutoDetection')
			});

			this.registeredTables = registeredTablesForContext;

			const fileTable = this.tables.find(t => t.type === 'file');
			this.isEditable = fileTable !== undefined;

			let transformedQuery = res.sql;
			if (this.isEditable) {
				const rowidSelections: string[] = [];
				let firstPrefix: string | null = null;

				for (const t of this.tables.filter(t => t.type === 'file')) {
					const dbTableName = registeredTablesForContext[t.tableAlias];
					if (dbTableName) {
						// 1. Detect if the alias is used in the query
						const aliasRegex = new RegExp('\\b(?:FROM|JOIN)\\s+' + t.tableAlias + '(?:\\s+(?:AS\\s+)?([a-zA-Z0-9_]+))?\\b', 'i');
						const match = this.query.match(aliasRegex);
						const aliasCandidate = match && match[1] ? match[1] : null;
						const isKeyword = aliasCandidate && /^(?:AS|ON|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ORDER|GROUP|LIMIT|UNION|SELECT|USING|NATURAL|WHERE|HAVING)$/i.test(aliasCandidate);
						const prefix = (aliasCandidate && !isKeyword) ? aliasCandidate : dbTableName;

						rowidSelections.push(`${prefix}.rowid as __rowid_${t.tableAlias}`);
						if (!firstPrefix) {
							firstPrefix = prefix;
						}
					}
				}

				if (rowidSelections.length > 0 && !/__rowid/i.test(transformedQuery)) {
					if (firstPrefix) {
						rowidSelections.push(`${firstPrefix}.rowid as __rowid`);
					}
					transformedQuery = transformedQuery.replace(/\bSELECT\b/i, `SELECT ${rowidSelections.join(', ')},`);
				}
			}

			if (this.flags.refresh) {
				registerObservers({
					bus: this.registrator,
					callback: () => this.render(),
					fileName: this.sourceKey,
					tables: res.mappedTables,
				});
			}

			let variables = {};
			const file = this.app.vault.getFileByPath(this.sourceKey);
			if (file) {
				const fileCache = this.app.metadataCache.getFileCache(file);
				variables = {
					...(fileCache?.frontmatter ?? {}),
					path: file.path,
					fileName: file.name,
					basename: file.basename,
					parent: file.parent?.path,
					extension: file.extension,
				};
			}

			// Merge with context frontmatter (used for Explorer variables)
			variables = {
				...variables,
				...this.ctx.frontmatter,
			};


			if (this.flags.explain) {
				// Rendering explain
				const result = await this.db.explain(transformedQuery, variables);
				this.explainEl.textContent = result;
			}

			
			const { data, columns } = (await this.db.select(
				transformedQuery,
				variables,
			))!; // FIXME: check this
			this.renderer.render({
				data,
				columns,
				flags: this.flags,
				frontmatter: variables,
				isEditable: this.isEditable,
				queryText: this.query,
			});

			// Setup onpage edit handlers
			const communicator = (this.renderer as any).communicator;
			if (communicator) {
				const gridApi = communicator.gridApi;
				if (gridApi) {
					// Set the value changed listener
					if (this.isEditable) {
						gridApi.setGridOption('onCellValueChanged', (event: any) => {
							this.handleCellValueChanged(event);
						});
					}

					// Set the cell clicked listener for Ctrl+Click wikilink behavior
					gridApi.setGridOption('onCellClicked', (event: any) => {
						const mouseEvent = event.event as MouseEvent;
						if (mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey)) {
							const field = event.colDef.field;
							const autocompleteSetting = this.settings.get('autocompleteColumns' as any) || '';
							const { columns: autocompleteCols } = parseAutocompleteSettings(autocompleteSetting);
							
							if (field && autocompleteCols.includes(field.toLowerCase())) {
								const value = event.value;
								if (value && typeof value === 'string' && value.trim()) {
									const resolvedLink = resolveWikiLink(this.app, value.trim(), field);
									this.app.workspace.openLinkText(resolvedLink, this.sourceKey, true);
								}
							}
						}
					});

					// Set the cell mouseover listener for Ctrl+Hover wikilink behavior
					gridApi.setGridOption('onCellMouseOver', (event: any) => {
						const mouseEvent = event.event as MouseEvent;
						if (mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey)) {
							const field = event.colDef.field;
							const autocompleteSetting = this.settings.get('autocompleteColumns' as any) || '';
							const { columns: autocompleteCols } = parseAutocompleteSettings(autocompleteSetting);
							
							if (field && autocompleteCols.includes(field.toLowerCase())) {
								const value = event.value;
								if (value && typeof value === 'string' && value.trim()) {
									const resolvedLink = resolveWikiLink(this.app, value.trim(), field);
									if (resolvedLink) {
										this.app.workspace.trigger("hover-link", {
											event: mouseEvent,
											source: "sqlseal",
											hoverParent: this.el,
											targetEl: mouseEvent.target as HTMLElement,
											linktext: resolvedLink,
											sourcePath: this.sourceKey,
										});
									}
								}
							}
						}
					});
				}
			}

			if (this.isEditable && fileTable) {
				this.targetTableAlias = fileTable.tableAlias;
				const path = this.app.metadataCache.getFirstLinkpathDest(fileTable.arguments[0], this.sourceKey);
				if (path) {
					this.targetSourcePath = path.path;
					this.targetTableName = registeredTablesForContext[this.targetTableAlias];
				}
			}

			// Append debug info if debug mode is active
			const existingDebug = this.el.querySelector(".sqlseal-debug-info");
			if (existingDebug) {
				existingDebug.remove();
			}
			if (this.settings.get("debug" as any)) {
				const debugEl = this.el.createDiv({ cls: "sqlseal-debug-info" });
				debugEl.setText(`[SQLSeal Debug] isEditable: ${this.isEditable} | tables: ${JSON.stringify(this.tables)} | mappedTables: ${JSON.stringify(res.mappedTables)} | enableEditing: ${this.settings.get("enableEditing")}`);
				debugEl.style.fontSize = "11px";
				debugEl.style.color = "var(--text-accent)";
				debugEl.style.padding = "5px 10px";
				debugEl.style.backgroundColor = "var(--background-secondary)";
				debugEl.style.borderRadius = "4px";
				debugEl.style.marginTop = "10px";
			}
		} catch (e) {
			this.renderer.error(e.toString());
		}
	}

    private cachedName: string | null = null

    get isOnCanvas() {
        return !this.ctx.sourcePath
    }

	get canvasName() {
        // This is hack to detect what name has current canvas.
        // It's not fool proof but should work for majority of use-cases for now.
        // We need to find proper way of getting it or ask Obsidian devs to expose some info.
        
        if (this.cachedName !== null) {
            return this.cachedName
        }
		const canvasViews = this.app.workspace.getLeavesOfType("canvas");

		for (const leaf of canvasViews) {
            const canvasView = leaf.view as any; // Canvas view has data and file properties not exposed in base View type
            const nodes = JSON.parse(canvasView.data).nodes
            const node = nodes.filter((n: any) => n.text).find((n: any) => n.text.contains(this.source))
            if (node) {
                this.cachedName = canvasView.file.path
                return this.cachedName as string
            }
		}
        this.cachedName = ''
        return ''
	}

	get sourceKey() {
		return this.ctx.sourcePath.trim() ? this.ctx.sourcePath.trim() : this.canvasName;
	}

	async registerTables(tables: TableDefinition[]) {
		await Promise.all(
			tables.map((table) =>
				this.sync.registerTable({
					...table,
					sourceFile: this.sourceKey,
				}),
			),
		);
	}

	private async handleCellValueChanged(event: any) {
		const oldValue = event.oldValue;
		const newValue = event.newValue;
		if (oldValue === newValue) return;

		const field = event.colDef.field;
		const rowData = event.data;

		try {
			// Find the source table that contains this column case-insensitively
			let targetTable: TableDefinition | null = null;
			let targetDbTableName = "";
			let resolvedFieldName = field; // fallback

			for (const t of this.tables.filter(t => t.type === 'file')) {
				const dbTableName = this.registeredTables[t.tableAlias];
				if (!dbTableName) continue;
				const columns = await this.db.getColumns(dbTableName);
				if (columns) {
					const matchedCol = columns.find(c => c.toLowerCase() === field.toLowerCase());
					if (matchedCol) {
						targetTable = t;
						targetDbTableName = dbTableName;
						resolvedFieldName = matchedCol;
						break;
					}
				}
			}

			if (!targetTable || !targetDbTableName) {
				throw new Error(`Could not find column "${field}" in any referenced tables.`);
			}

			// Get the rowid for this specific table
			const rowid = rowData[`__rowid_${targetTable.tableAlias}`] ?? rowData.__rowid;
			if (rowid === undefined || rowid === null) {
				throw new Error(`Row ID not found for table "${targetTable.tableAlias}". Cannot save.`);
			}

			// Find source file path
			const path = this.app.metadataCache.getFirstLinkpathDest(targetTable.arguments[0], this.sourceKey);
			if (!path) {
				throw new Error(`File not found: ${targetTable.arguments[0]}`);
			}
			const targetSourcePath = path.path;

			// Create a modal to ask for confirmation
			const modal = new CellSaveConfirmationModal(
				this.app,
				field,
				oldValue,
				newValue,
				async () => {
					// Confirm / OK: Save to DB and file
					try {
						const rowEdit = { rowid, [resolvedFieldName]: newValue };
						
						// 1. Update the database table
						await this.db.updateData(targetDbTableName, [rowEdit], 'rowid');

						// 2. Fetch the entire updated data from database
						const { data: allRows } = (await this.db.select(`SELECT * FROM ${targetDbTableName}`, {}))!;

						// 3. Serialize back to the file
						const file = this.app.vault.getFileByPath(targetSourcePath);
						if (!file) {
							throw new Error(`File not found: ${targetSourcePath}`);
						}
						const extension = file.extension.toLowerCase();
						let output: string;
						
						const cleanRows = allRows.map(row => {
							const cleanRow = { ...row };
							delete cleanRow.__rowid;
							delete cleanRow.rowid;
							for (const key of Object.keys(cleanRow)) {
								if (key.startsWith('__rowid_')) {
									delete cleanRow[key];
								}
							}
							return cleanRow;
						});

						if (extension === 'csv' || extension === 'tsv') {
							const { unparse } = await import("papaparse");
							output = unparse(cleanRows, {
								delimiter: extension === 'tsv' ? '\t' : ','
							});
						} else if (extension === 'json' || extension === 'json5') {
							output = JSON.stringify(cleanRows, null, 2);
						} else {
							throw new Error(`Unsupported output format: ${extension}`);
						}

						// 4. Modify the vault file
						await this.app.vault.modify(file, output);

						new Notice(`Saved change: ${oldValue} -> ${newValue}`);
						
						// Re-render to show updated database data
						await this.render();
					} catch (e) {
						console.error("SQLSeal: Error saving edits:", e);
						new Notice(`Failed to save: ${e.message}`);
						// Revert the cell value in the grid
						event.node.setDataValue(field, oldValue);
					}
				},
				() => {
					// Cancel: Revert the cell value in the grid
					event.node.setDataValue(field, oldValue);
				}
			);
			modal.open();
		} catch (e) {
			console.error("SQLSeal: Error during handleCellValueChanged preparation:", e);
			new Notice(`Failed to initiate save: ${e.message}`);
			event.node.setDataValue(field, oldValue);
		}
	}
}

class CellSaveConfirmationModal extends Modal {
	constructor(
		app: App,
		private field: string,
		private oldValue: any,
		private newValue: any,
		private onConfirm: () => Promise<void>,
		private onCancel: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Save Changes" });
		
		const desc = contentEl.createEl("p");
		desc.setText(`Are you sure you want to update the field "${this.field}" from "${this.oldValue}" to "${this.newValue}"?`);

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.onCancel();
			this.close();
		});

		const saveBtn = buttonContainer.createEl("button", {
			text: "Save",
			cls: "mod-cta"
		});
		saveBtn.addEventListener("click", async () => {
			await this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
