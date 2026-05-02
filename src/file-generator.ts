import { App, TFile, normalizePath } from 'obsidian';
import type { TableRow } from './table-parser';
import { normalizeKey } from './table-parser';

export interface GenerateOptions {
	rows: TableRow[];
	filenameColumn: string;
	subfolder: string;
	/** Vault-relative path. When non-empty, overrides baseFolderPath + subfolder entirely. */
	customOutputPath: string;
	bodyTemplate: string;
	openAfterCreate: boolean;
}

export interface GenerateResult {
	created: string[];
	skipped: number;
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function buildFrontmatter(row: TableRow): string {
	const lines = ['---'];
	for (const [header, value] of Object.entries(row)) {
		const key = normalizeKey(header);
		if (!key) continue;
		lines.push(`${key}: ${value}`);
	}
	lines.push('---');
	return lines.join('\n');
}

export async function generateFiles(
	app: App,
	options: GenerateOptions,
	baseFolderPath: string,
): Promise<GenerateResult> {
	const { rows, filenameColumn, subfolder, customOutputPath, bodyTemplate, openAfterCreate } = options;

	const folderPath = customOutputPath.trim()
		? normalizePath(customOutputPath.trim())
		: normalizePath(baseFolderPath ? `${baseFolderPath}/${subfolder}` : subfolder);

	if (!app.vault.getAbstractFileByPath(folderPath)) {
		await app.vault.createFolder(folderPath);
	}

	const created: string[] = [];
	let skipped = 0;

	for (const row of rows) {
		const rawName = row[filenameColumn]?.trim() ?? '';
		if (!rawName) {
			skipped++;
			continue;
		}

		const filename = sanitizeFilename(rawName);
		if (!filename) {
			skipped++;
			continue;
		}

		const filePath = normalizePath(`${folderPath}/${filename}.md`);
		const frontmatter = buildFrontmatter(row);
		const content = bodyTemplate
			? `${frontmatter}\n\n${bodyTemplate}`
			: `${frontmatter}\n`;

		const existing = app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			await app.vault.modify(existing, content);
		} else {
			await app.vault.create(filePath, content);
		}

		created.push(filePath);
	}

	if (openAfterCreate && created.length > 0) {
		const firstPath = created[0];
		if (firstPath) {
			const firstFile = app.vault.getAbstractFileByPath(firstPath);
			if (firstFile instanceof TFile) {
				await app.workspace.getLeaf().openFile(firstFile);
			}
		}
	}

	return { created, skipped };
}
