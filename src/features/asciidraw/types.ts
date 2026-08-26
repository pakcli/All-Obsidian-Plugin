/**
 * ASCII Draw & Motion Types
 */

export type AsciiTool =
	| 'pencil'
	| 'eraser'
	| 'line'
	| 'arrow'
	| 'box'
	| 'circle'
	| 'fill'
	| 'text'
	| 'select'
	| 'transform';

export type BoxStyle = 'single' | 'double' | 'ascii' | 'solid' | 'dashed' | 'rounded';
export type LineStyle = 'single' | 'double' | 'ascii' | 'dashed';
export type ArrowStyle = 'right' | 'left' | 'both' | 'up' | 'down';

export interface Cell {
	char: string;
	fg?: string;
	bg?: string;
	bold?: boolean;
}

export interface Frame {
	id: string;
	cells: Cell[][]; // [row][col]
	durationMs?: number;
}

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	opacity: number;
	frames: Frame[];
}

export interface CanvasDimensions {
	cols: number; // width in characters
	rows: number; // height in characters
}

export type AsciiTheme =
	| 'default'
	| 'dark-terminal'
	| 'matrix-green'
	| 'amber-crt'
	| 'cyber-neon'
	| 'paper-ink'
	| 'monokai'
	| 'dracula';

export interface LayerData {
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	opacity?: number;
	content: string;
}

export interface AsciiProjectData {
	version: 1;
	type: 'asciidraw' | 'asciimotion';
	cols: number;
	rows: number;
	fps: number;
	theme: AsciiTheme;
	frames: string[]; // Serialized ASCII text for each frame
	layers?: LayerData[]; // Multi-layer support
	rawText?: string;
}

export interface AsciiStudioConfig {
	initialContent?: string;
	isAnimation?: boolean;
	targetFile?: string;
	codeblockRange?: { startLine: number; endLine: number };
	onSave?: (savedContent: string) => Promise<void> | void;
}

export interface Point {
	x: number; // column index (0 to cols-1)
	y: number; // row index (0 to rows-1)
}

export interface SelectionRect {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

export interface CharacterPresetGroup {
	title: string;
	chars: string[];
}

export const CHARACTER_PRESETS: CharacterPresetGroup[] = [
	{
		title: 'Box Drawing (Single & Curved)',
		chars: ['┌', '─', '┐', '│', '└', '┘', '├', '┤', '┬', '┴', '┼', '╭', '╮', '╯', '╰']
	},
	{
		title: 'Box Drawing (Double & Heavy)',
		chars: ['╔', '═', '╗', '║', '╚', '╝', '╠', '╣', '╦', '╩', '╬', '┏', '━', '┓', '┃', '┗', '┛']
	},
	{
		title: 'Block & Shading Elements',
		chars: ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐', '■', '□', '▪', '▫', '▖', '▗', '▘', '▙', '▚', '▛', '▜', '▝', '▞', '▟']
	},
	{
		title: 'Arrows & Connectors',
		chars: ['←', '↑', '→', '↓', '↔', '↕', '↖', '↗', '↘', '↙', '▲', '▼', '►', '◄', '➔', '➜', '➤', '●', '○', '◆', '◇']
	},
	{
		title: 'Minimal ASCII & Symbols',
		chars: ['#', '@', '*', '+', '=', '-', '~', '^', ':', '.', '/', '\\', '|', '_', '$', '%', '&', '<', '>', '(', ')', '[', ']', '{', '}']
	},
	{
		title: 'Cyber / Matrix / Katakana',
		chars: ['ｦ', 'ｱ', 'ｳ', 'ｴ', 'ｵ', 'ｶ', 'ｷ', 'ｹ', 'ｺ', 'ｻ', 'ｼ', 'ｽ', 'ｾ', 'ｿ', 'ﾀ', 'ﾂ', 'ﾃ', 'ﾅ', 'ﾆ', 'ﾇ', 'ﾈ', 'ﾊ', 'ﾋ', 'ﾎ', 'ﾏ', 'ﾐ', 'ﾑ', 'ﾒ', 'ﾓ', 'ﾔ', 'ﾕ', 'ﾗ', 'ﾘ', 'ﾜ']
	},
	{
		title: 'Braille Dots',
		chars: ['⠁', '⠂', '⠄', '⠡', '⠲', '⠵', '⠷', '⠿', '⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿']
	}
];

export const THEME_PALETTES: Record<AsciiTheme, { fg: string; bg: string; border: string; accent: string; label: string }> = {
	'default': {
		fg: 'var(--text-normal)',
		bg: 'var(--background-secondary)',
		border: 'var(--background-modifier-border)',
		accent: 'var(--interactive-accent)',
		label: 'Obsidian Native'
	},
	'dark-terminal': {
		fg: '#d4d4d4',
		bg: '#18181b',
		border: '#3f3f46',
		accent: '#38bdf8',
		label: 'Dark Terminal'
	},
	'matrix-green': {
		fg: '#00ff66',
		bg: '#051007',
		border: '#005522',
		accent: '#00ff66',
		label: 'Matrix Green'
	},
	'amber-crt': {
		fg: '#ffb000',
		bg: '#140c00',
		border: '#543600',
		accent: '#ffb000',
		label: 'Amber CRT'
	},
	'cyber-neon': {
		fg: '#00f0ff',
		bg: '#0d0221',
		border: '#ff007f',
		accent: '#ff007f',
		label: 'Cyber Neon'
	},
	'paper-ink': {
		fg: '#1f2937',
		bg: '#fcfbf7',
		border: '#e5e7eb',
		accent: '#3b82f6',
		label: 'Paper Ink'
	},
	'monokai': {
		fg: '#f8f8f2',
		bg: '#272822',
		border: '#49483e',
		accent: '#a6e22e',
		label: 'Monokai'
	},
	'dracula': {
		fg: '#f8f8f2',
		bg: '#282a36',
		border: '#44475a',
		accent: '#bd93f9',
		label: 'Dracula'
	}
};
