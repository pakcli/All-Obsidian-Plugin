import { MarkdownView, Plugin } from 'obsidian';

export interface CodeblockLanguageRule {
	id: string;
	language: string;
	behavior: 'scalefit' | 'flowclip' | 'wrap';
}

/**
 * Renders an ASCII art text string as an SVG diagram widget (like Mermaid JS),
 * ensuring 100% fit to width, zero text wrapping, zero horizontal scrollbars,
 * and exact 1:1 vector aspect ratio scaling.
 */
export function renderAsciiSvg(source: string, container: HTMLElement): void {
	container.empty();

	const lines = source.split('\n');
	while (lines.length > 0 && lines[0].trim() === '') {
		lines.shift();
	}
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
		lines.pop();
	}

	if (lines.length === 0) return;

	let maxCols = 0;
	lines.forEach((l) => {
		if (l.length > maxCols) maxCols = l.length;
	});

	if (maxCols === 0) return;

	const charWidth = 8.1;
	const charHeight = 14;
	const totalWidth = Math.ceil(maxCols * charWidth);
	const totalHeight = Math.ceil(lines.length * charHeight);

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', 'auto');
	svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
	svg.style.cssText = `
		display: block !important;
		width: 100% !important;
		max-width: 100% !important;
		height: auto !important;
		background: transparent !important;
		user-select: text !important;
		margin: 4px 0 !important;
	`;

	const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
	style.textContent = `
		text.ascii-line {
			font-family: var(--font-monospace), 'Courier New', Courier, monospace !important;
			font-size: 13.5px !important;
			fill: var(--text-normal, currentColor) !important;
			white-space: pre !important;
			letter-spacing: 0px !important;
		}
	`;
	svg.appendChild(style);

	lines.forEach((lineText, index) => {
		const textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		textNode.setAttribute('class', 'ascii-line');
		textNode.setAttribute('x', '0');
		textNode.setAttribute('y', `${(index + 1) * charHeight - 3}`);
		textNode.setAttribute('xml:space', 'preserve');
		textNode.textContent = lineText;
		svg.appendChild(textNode);
	});

	const wrapper = container.createDiv({ cls: 'pakcli-ascii-svg-wrapper' });
	wrapper.style.cssText = `
		width: 100% !important;
		max-width: 100% !important;
		overflow: hidden !important;
		display: block !important;
		margin: 4px 0 !important;
	`;
	wrapper.appendChild(svg);
}

export class CodeblockScaler {
	private isProcessing = false;
	private debounceTimer: number | null = null;

	constructor(
		private plugin: Plugin & {
			settings: {
				codeblockWrapMode: 'scalefit' | 'flowclip' | 'wrap';
				codeblockLanguageRules?: CodeblockLanguageRule[];
			};
		}
	) {}

	init(): void {
		// 1. Register Post Processor for Reading View
		this.plugin.registerMarkdownPostProcessor((element) => {
			this.processContainer(element);
		});

		// 2. Register Workspace & Editor events
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('layout-change', () => this.scheduleRescale())
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => this.scheduleRescale())
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('css-change', () => this.scheduleRescale())
		);

		// 3. Listen to DOM editor key events (debounced)
		this.plugin.registerDomEvent(window, 'keyup', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'v') {
				this.scheduleRescale();
			}
		});
	}

	scheduleRescale(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			this.rescaleAll();
		}, 100);
	}

	rescaleAll(): void {
		if (this.isProcessing) return;
		this.isProcessing = true;

		try {
			const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.contentEl) {
				this.processContainer(activeView.contentEl);
			}
		} finally {
			this.isProcessing = false;
		}
	}

	getBehaviorForLanguage(lang: string): 'scalefit' | 'flowclip' | 'wrap' {
		const cleanLang = (lang || '').trim().toLowerCase();

		const rules = this.plugin.settings.codeblockLanguageRules || [];
		for (const rule of rules) {
			const rLang = rule.language.trim().toLowerCase();
			if (rLang && rLang === cleanLang) {
				return rule.behavior;
			}
		}

		if (cleanLang === 'asci' || cleanLang === 'ascii' || cleanLang === 'scalefit') {
			return 'scalefit';
		}

		return this.plugin.settings.codeblockWrapMode || 'flowclip';
	}

	getBehaviorForElement(preEl: HTMLElement, codeEl: HTMLElement): 'scalefit' | 'flowclip' | 'wrap' {
		const classList = Array.from(codeEl.classList).concat(Array.from(preEl.classList));
		const rules = this.plugin.settings.codeblockLanguageRules || [];

		for (const rule of rules) {
			const target = rule.language.trim().toLowerCase();
			if (!target) continue;

			const match = classList.some((cls) => {
				const c = cls.toLowerCase();
				return c === `language-${target}` || c === `block-language-${target}` || c === target || c.includes(target);
			});

			if (match) {
				return rule.behavior;
			}
		}

		if (classList.some((c) => c.toLowerCase().includes('asci') || c.toLowerCase().includes('scalefit'))) {
			return 'scalefit';
		}

		return this.plugin.settings.codeblockWrapMode || 'flowclip';
	}

	processContainer(container: HTMLElement): void {
		// Reading View <pre>
		const preElements = container.querySelectorAll('pre');
		preElements.forEach((pre) => {
			const codeEl = (pre.querySelector('code') || pre) as HTMLElement;
			const behavior = this.getBehaviorForElement(pre as HTMLElement, codeEl);

			if (behavior === 'scalefit') {
				const text = codeEl.textContent || pre.textContent || '';
				if (text.trim()) {
					renderAsciiSvg(text, pre as HTMLElement);
				}
			} else if (behavior === 'wrap') {
				pre.setCssProps({
					'white-space': 'pre-wrap',
					'word-break': 'break-all',
					'overflow-x': 'hidden'
				});
			} else {
				// Flowclip: Each pre is INDIVIDUAL slider!
				pre.setCssProps({
					'white-space': 'pre',
					'word-break': 'normal',
					'overflow-x': 'auto',
					'display': 'block',
					'max-width': '100%'
				});
			}
		});

		// Live Preview CodeMirror lines (.cm-line.HyperMD-codeblock)
		const cmLines = container.querySelectorAll('.cm-line.HyperMD-codeblock');
		if (cmLines.length > 0) {
			this.processCmLines(cmLines);
		}
	}

	private processCmLines(cmLines: NodeListOf<Element>): void {
		let currentBlockLines: HTMLElement[] = [];
		let currentLanguage = '';

		const flushBlock = () => {
			if (currentBlockLines.length === 0) return;

			const behavior = this.getBehaviorForLanguage(currentLanguage);
			const firstLine = currentBlockLines[0];
			const parent = firstLine.parentElement;

			if (!parent) {
				currentBlockLines = [];
				currentLanguage = '';
				return;
			}

			if (behavior === 'wrap') {
				currentBlockLines.forEach((line) => {
					line.setCssProps({
						'white-space': 'pre-wrap',
						'word-break': 'break-all',
						'overflow-wrap': 'anywhere',
						'overflow-x': 'hidden'
					});
				});
			} else {
				// FLOWCLIP: 1 CODEBLOCK = 1 INDIVIDUAL SLIDER!
				let slider: HTMLElement;
				if (parent.classList.contains('pakcli-codeblock-slider')) {
					slider = parent;
				} else {
					slider = parent.createEl('div', {
						cls: 'pakcli-codeblock-slider',
					});
					slider.setCssProps({
						'display': 'block',
						'max-width': '100%',
						'overflow-x': 'auto',
						'overflow-y': 'hidden',
						'margin': '4px 0',
						'padding': '0',
						'box-sizing': 'border-box'
					});
					parent.insertBefore(slider, firstLine);
					currentBlockLines.forEach((line) => {
						slider.appendChild(line);
					});
				}

				currentBlockLines.forEach((line) => {
					line.setCssProps({
						'white-space': 'pre',
						'word-break': 'normal',
						'word-wrap': 'normal',
						'overflow-x': 'visible',
						'overflow-y': 'visible'
					});
				});
			}

			currentBlockLines = [];
			currentLanguage = '';
		};

		cmLines.forEach((el) => {
			const line = el as HTMLElement;
			const text = line.textContent?.trim() || '';

			if (line.classList.contains('HyperMD-codeblock-begin')) {
				flushBlock();
				currentLanguage = text.replace(/^```/, '').trim().toLowerCase();
				currentBlockLines.push(line);
			} else if (line.classList.contains('HyperMD-codeblock-end')) {
				currentBlockLines.push(line);
				flushBlock();
			} else {
				if (!currentLanguage && text.startsWith('```')) {
					currentLanguage = text.replace(/^```/, '').trim().toLowerCase();
				}
				currentBlockLines.push(line);
			}
		});

		flushBlock();
	}

	destroy(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}
}
