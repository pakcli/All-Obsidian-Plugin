/**
 * diffViewer.ts
 *
 * Line-by-line diff computation and HTML renderer for the codeblock sync comparison.
 */

export interface DiffLine {
    type: 'added' | 'removed' | 'unchanged';
    text: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

/**
 * Computes simple line-by-line diff between two strings.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);
    const diff: DiffLine[] = [];

    // Simple LCS-based or line-matching diff
    let i = 0;
    let j = 0;
    let oldNum = 1;
    let newNum = 1;

    while (i < oldLines.length || j < newLines.length) {
        if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
            diff.push({
                type: 'unchanged',
                text: oldLines[i] || '',
                oldLineNumber: oldNum++,
                newLineNumber: newNum++
            });
            i++;
            j++;
        } else if (j < newLines.length && (!oldLines.includes(newLines[j] || '') || (i >= oldLines.length))) {
            diff.push({
                type: 'added',
                text: newLines[j] || '',
                newLineNumber: newNum++
            });
            j++;
        } else if (i < oldLines.length) {
            diff.push({
                type: 'removed',
                text: oldLines[i] || '',
                oldLineNumber: oldNum++
            });
            i++;
        } else {
            break;
        }
    }

    return diff;
}

/**
 * Renders diff output into a container element.
 */
export function renderDiffViewer(container: HTMLElement, oldText: string, newText: string, oldLabel = 'CLI Script', newLabel = 'Manager Note'): void {
    container.empty();

    const header = container.createDiv({ cls: 'pakcli-diff-header' });
    header.createSpan({ cls: 'pakcli-diff-old-label', text: `🔴 ${oldLabel}` });
    header.createSpan({ cls: 'pakcli-diff-arrow', text: '⇄' });
    header.createSpan({ cls: 'pakcli-diff-new-label', text: `🟢 ${newLabel}` });

    const diffLines = computeLineDiff(oldText, newText);
    const diffTable = container.createDiv({ cls: 'pakcli-diff-table' });

    let hasChanges = false;

    diffLines.forEach((line) => {
        if (line.type !== 'unchanged') hasChanges = true;

        const row = diffTable.createDiv({ cls: `pakcli-diff-row pakcli-diff-${line.type}` });

        const marker = row.createSpan({ cls: 'pakcli-diff-marker' });
        marker.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

        const content = row.createSpan({ cls: 'pakcli-diff-content' });
        content.textContent = line.text;
    });

    if (!hasChanges) {
        diffTable.empty();
        diffTable.createDiv({ cls: 'pakcli-diff-no-changes', text: '✓ Content is identical. No differences detected.' });
    }
}
