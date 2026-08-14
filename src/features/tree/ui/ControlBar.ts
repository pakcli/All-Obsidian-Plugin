/**
 * ControlBar component - Top control bar with interactive toggle, copy, and settings buttons
 */
export class ControlBar {
	private interactive: boolean;
	private onInteractiveToggle: () => void;
	private onCopy: () => Promise<string>;
	private onSettingsToggle: () => void;
	private onCreateStructure?: () => void;

	constructor(
		interactive: boolean,
		onInteractiveToggle: () => void,
		onCopy: () => Promise<string>,
		onSettingsToggle: () => void,
		onCreateStructure?: () => void
	) {
		this.interactive = interactive;
		this.onInteractiveToggle = onInteractiveToggle;
		this.onCopy = onCopy;
		this.onSettingsToggle = onSettingsToggle;
		this.onCreateStructure = onCreateStructure;
	}

	/**
	 * Render the control bar
	 */
	render(container: HTMLElement): HTMLElement {
		const topBar = container.createDiv({ cls: 'tree-top-control-bar' });
		
		// Interactive toggle button
		const interactiveBtn = topBar.createEl("button", {
			text: this.interactive ? "(v) interactive" : "(>) interactive",
			cls: 'tree-control-button'
		});
		interactiveBtn.onclick = () => {
			this.onInteractiveToggle();
		};
		
		// Copy button
		const copyBtn = topBar.createEl("button", { 
			text: "copy",
			cls: 'tree-control-button'
		});
		copyBtn.onclick = async () => {
			const plainText = await this.onCopy();
			// Import copyToClipboard here to avoid circular dependency
			const { copyToClipboard } = await import('../utils/clipboard');
			const ok = await copyToClipboard(plainText);
			copyBtn.textContent = ok ? "Copied!" : "Fail";
			window.setTimeout(() => (copyBtn.textContent = "copy"), 1200);
		};

		// Create structure button
		if (this.onCreateStructure) {
			const createBtn = topBar.createEl("button", {
				text: "create folders",
				cls: 'tree-control-button tree-create-btn'
			});
			createBtn.onclick = () => {
				if (this.onCreateStructure) {
					this.onCreateStructure();
				}
			};
		}
		
		// Settings toggle button (three dots)
		const settingsBtn = topBar.createEl("button", {
			text: "⋯",
			cls: 'tree-control-button tree-settings-toggle'
		});
		settingsBtn.onclick = () => {
			this.onSettingsToggle();
		};
		
		return topBar;
	}
}
