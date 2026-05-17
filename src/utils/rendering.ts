/**
 * Parse wikilinks in text and create HTML with proper link elements
 */
export function parseWikilinks(text: string): DocumentFragment {
	const fragment = document.createDocumentFragment();
	
	// Regex to match [[target|alias]] or [[target]]
	const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	let lastIndex = 0;
	let match;
	
	console.log(`[parseWikilinks] Parsing text: "${text}"`);
	
	while ((match = wikilinkRegex.exec(text)) !== null) {
		console.log(`[parseWikilinks] Found wikilink: ${match[0]}`);
		
		// Add text before the wikilink
		if (match.index > lastIndex) {
			const textNode = document.createTextNode(text.substring(lastIndex, match.index));
			fragment.appendChild(textNode);
		}
		
		// Create wikilink element
		const target = match[1].trim();
		const alias = match[2] ? match[2].trim() : target;
		
		console.log(`[parseWikilinks] Creating link: target="${target}", alias="${alias}"`);
		
		const link = document.createElement('a');
		link.className = 'internal-link';
		link.setAttribute('data-href', target);
		link.textContent = alias;
		fragment.appendChild(link);
		
		lastIndex = match.index + match[0].length;
	}
	
	// Add remaining text
	if (lastIndex < text.length) {
		const textNode = document.createTextNode(text.substring(lastIndex));
		fragment.appendChild(textNode);
	}
	
	return fragment;
}

/**
 * Enable wikilink navigation in a container element
 * Makes links clickable and enables hover preview
 */
export function enableWikiLinks(
	container: HTMLElement,
	app: any,
	sourcePath: string
): void {
	container.querySelectorAll("a.internal-link").forEach((link) => {
		const anchor = link as HTMLAnchorElement;
		const href = anchor.dataset.href;
		
		if (href) {
			// Set href attribute for proper link behavior
			anchor.setAttribute('href', href);
			
			// Add data-tooltip-position for hover preview
			anchor.setAttribute('data-tooltip-position', 'top');
			
			// Add aria-label for accessibility
			anchor.setAttribute('aria-label', href);
			
			// Set target to make it an internal link
			anchor.setAttribute('target', '_blank');
			anchor.setAttribute('rel', 'noopener');
			
			// Handle click to open link
			anchor.onclick = (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				app.workspace.openLinkText(href, sourcePath, e.ctrlKey || e.metaKey);
			};
			
			// Handle hover for preview (Obsidian will handle this automatically with proper attributes)
			anchor.addEventListener('mouseenter', (e: MouseEvent) => {
				// Obsidian's hover preview will trigger automatically
				// because we have the correct class and attributes
				app.workspace.trigger('hover-link', {
					event: e,
					source: 'preview',
					hoverParent: container,
					targetEl: anchor,
					linktext: href,
					sourcePath: sourcePath
				});
			});
		}
	});
}

/**
 * Render content cell with multiple values separated by <br>
 */
export function renderContentCell(values: string[]): HTMLTableCellElement {
	const cell = document.createElement('td');
	
	if (values.length > 0) {
		values.forEach((value, index) => {
			if (index > 0) {
				cell.appendChild(document.createElement('br'));
			}
			const fragment = parseWikilinks(value);
			cell.appendChild(fragment);
		});
	} else {
		cell.textContent = '';
		cell.classList.add('empty-cell');
	}
	
	return cell;
}
