import { App, Plugin, TFile } from "obsidian";
import { AFileSyncTable } from "./abstractFileSyncTable";
import { difference } from "lodash";
import { sanitise } from "../../../../utils/sanitiseColumn";
import { SqlocalDatabaseProxy } from "../../../database/sqlocal/sqlocalDatabaseProxy";
import Papa from "papaparse";
import { parse as parseJson5 } from "json5";


export const FILES_TABLE_NAME = 'files'


const extractFrontmatterFromFile = (file: TFile, plugin: Plugin): Record<string, unknown> => {
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter || {}

    return Object.fromEntries(
        Object.entries(frontmatter)
            .map(([v, s]) => ([sanitise(v), s]))
    )
}

async function getFileRowCount(app: App, file: TFile): Promise<number | null> {
    const ext = file.extension.toLowerCase();
    try {
        if (ext === 'csv' || ext === 'tsv') {
            const content = await app.vault.read(file);
            const delimiter = ext === 'tsv' ? '\t' : ',';
            const parsed = Papa.parse<string[]>(content, {
                delimiter,
                skipEmptyLines: 'greedy',
            });
            if (parsed.data.length === 0) return 0;
            return Math.max(0, parsed.data.length - 1);
        } else if (ext === 'json' || ext === 'json5') {
            const content = await app.vault.read(file);
            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (jsonErr) {
                parsed = parseJson5(content);
            }
            if (Array.isArray(parsed)) return parsed.length;
            if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed).length;
            return 1;
        } else if (ext === 'jsonl') {
            const content = await app.vault.read(file);
            const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
            return lines.length;
        }
    } catch (e) {
        console.error("Failed to get row count for file:", file.path, e);
    }
    return null;
}

async function fileData(app: App, file: TFile, { ...frontmatter }: Record<string, any>) {
    const rowCount = await getFileRowCount(app, file);
    return {
        ...frontmatter,
        id: file.path,
        path: file.path,
        name: file.basename,
        created_at: (new Date(file.stat.ctime)).toISOString(),
        modified_at: (new Date(file.stat.mtime)).toISOString(),
        file_size: file.stat.size,
        row_count: rowCount
    }
}

export class FilesFileSyncTable extends AFileSyncTable {
    get tableName() {
        return FILES_TABLE_NAME
    }
    private columns: string[] = []
    shouldPerformBulkInsert = true;
    constructor(db: SqlocalDatabaseProxy, app: App, private readonly plugin: Plugin) {
        super(db, app)
    }
    async onFileModify(file: TFile): Promise<void> {
        const frontmatter = extractFrontmatterFromFile(file, this.plugin)
        const frontmatterWithFileData = await fileData(this.app, file, frontmatter)
        const columns = Object.keys(frontmatterWithFileData)
        await this.updateColumnsIfNeeded(columns)

        await this.db.updateData(FILES_TABLE_NAME, [frontmatterWithFileData])
        // @ts-ignore
        if (typeof sleep !== 'undefined') {
            // @ts-ignore
            await sleep(1000)
        } else {
            await new Promise(r => window.setTimeout(r, 1000));
        }
    }
    async onFileDelete(path: string): Promise<void> {
        await this.db.deleteData(FILES_TABLE_NAME, [{ id: path }])
    }

    async updateColumnsIfNeeded(newSetOfColumns: string[]) {
        const newColumns = difference(newSetOfColumns, this.columns)
        if (newColumns.length) {
            await this.db.addColumns(FILES_TABLE_NAME, newColumns)
            this.columns = (await this.db.getColumns(FILES_TABLE_NAME)) ?? []
        }
    }

    async onFileCreate(file: TFile): Promise<void> {
        const frontmatter = extractFrontmatterFromFile(file, this.plugin)
        const frontmatterWithFileData = await fileData(this.app, file, frontmatter)
        const columns = Object.keys(frontmatterWithFileData)
        await this.updateColumnsIfNeeded(columns)
        
        await this.db.insertData(FILES_TABLE_NAME, [frontmatterWithFileData])
    }

    async onFileCreateBulk(files: Array<TFile>) {
        this.columns = (await this.db.getColumns(FILES_TABLE_NAME)) ?? []

        for (const file of files) {
            await this.onFileCreate(file)
        }
    }


    async onInit(): Promise<void> {
        await this.db.createTableNoTypes(FILES_TABLE_NAME, ['id', 'name', 'path', 'created_at', 'modified_at', 'file_size', 'row_count'])
        this.columns = (await this.db.getColumns(FILES_TABLE_NAME)) ?? []

        const toIndex = ['id', 'name', 'path']
        await Promise.all(toIndex.map(column =>
            this.db.createIndex(`files_${column}_idx`, FILES_TABLE_NAME, [column])
        ))
    }
}
