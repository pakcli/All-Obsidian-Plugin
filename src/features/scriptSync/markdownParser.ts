/**
 * markdownParser.ts
 *
 * Implements precise extraction and reverse-injection for the first fenced codeblock
 * in a Markdown note, strictly preserving all surrounding titles, notes, and extra content.
 */
import { CodeBlockExtractResult } from './types';

/**
 * Extracts the first fenced code block (```lang ... ``` or ~~~lang ... ~~~) from markdown content.
 */
export function extractFirstCodeBlock(content: string): CodeBlockExtractResult | null {
    if (!content) return null;

    // Matches standard ``` or ~~~ codeblocks
    const regex = /^([ \t]*)(`{3,}|~{3,})([^\r\n]*)\r?\n([\s\S]*?)\r?\n\1\2[ \t]*$/m;
    const match = regex.exec(content);

    if (!match) return null;

    const fullMatch = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;
    const rawLang = (match[3] || '').trim().toLowerCase();
    const language = rawLang.split(/\s+/)[0] || 'text';
    const code = match[4] || '';

    return {
        language,
        code,
        startIndex,
        endIndex,
        header: match[2] + (match[3] ? match[3] : '')
    };
}

/**
 * Injects new code into the first codeblock of the markdown string.
 * If no code block is found, appends a new code block at the bottom of the document.
 */
export function injectFirstCodeBlock(fullMarkdown: string, newCode: string, language?: string): string {
    const existing = extractFirstCodeBlock(fullMarkdown);

    if (existing) {
        const before = fullMarkdown.slice(0, existing.startIndex);
        const after = fullMarkdown.slice(existing.endIndex);
        const langTag = language || existing.language || '';
        const fence = '```';

        const replacement = `${fence}${langTag}\n${newCode}\n${fence}`;
        return `${before}${replacement}${after}`;
    }

    // If no existing code block, append cleanly at bottom
    const langTag = language || 'text';
    const trimmed = fullMarkdown.trimEnd();
    const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : '';
    return `${prefix}\`\`\`${langTag}\n${newCode}\n\`\`\`\n`;
}
