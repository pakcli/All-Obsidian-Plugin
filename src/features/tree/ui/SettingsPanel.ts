import { TreeConfig } from '../utils/parser';
import { ViewMode } from '../renderers/DiagramRenderer';
import { Spinner } from './Spinner';

/**
 * SettingsPanel component - Settings panel with view mode, toggles, and spinners
 */
export class SettingsPanel {
	private config: TreeConfig;
	private viewMode: ViewMode;
	private levelNumberOffset: number;
	private isOpen: boolean;
	private onConfigChange: (updates: Partial<TreeConfig>) => Promise<void>;
	private onViewModeChange: (mode: ViewMode) => Promise<void>;
	private onOffsetChange: (offset: number) => Promise<void>;

	constructor(
		config: TreeConfig,
		viewMode: ViewMode,
		levelNumberOffset: number,
		isOpen: boolean,
		onConfigChange: (updates: Partial<TreeConfig>) => Promise<void>,
		onViewModeChange: (mode: ViewMode) => Promise<void>,
		onOffsetChange: (offset: number) => Promise<void>
	) {
		this.config = config;
		this.viewMode = viewMode;
		this.levelNumberOffset = levelNumberOffset;
		this.isOpen = isOpen;
		this.onConfigChange = onConfigChange;
		this.onViewModeChange = onViewModeChange;
		this.onOffsetChange = onOffsetChange;
	}

	/**
	 * Render the settings panel
	 */
	render(container: HTMLElement): HTMLElement {
		const settingsPanel = container.createDiv({ 
			cls: this.isOpen ? 'tree-settings-panel open' : 'tree-settings-panel'
		});
		
		if (!this.isOpen) {
			return settingsPanel;
		}
		
		// Settings header
		const header = settingsPanel.createDiv({ cls: 'settings-header' });
		header.createEl("h3", { text: "settings" });
		
		// View mode dropdown
		this.renderViewModeDropdown(settingsPanel);
		
		// Interactive toggle
		this.renderInteractiveToggle(settingsPanel);
		
		// Start show level spinner
		this.renderStartShowLevelSpinner(settingsPanel);
		
		// Level numbered spinner
		this.renderLevelNumberedSpinner(settingsPanel);
		
		// Level number offset spinner
		this.renderOffsetSpinner(settingsPanel);
		
		return settingsPanel;
	}

	private renderViewModeDropdown(container: HTMLElement): void {
		const viewModeGroup = container.createDiv({ cls: 'settings-group' });
		viewModeGroup.createEl("label", { text: "view mode", cls: 'settings-label' });
		const viewModeSelect = viewModeGroup.createEl("select", {
			cls: 'settings-select'
		});
		viewModeSelect.createEl("option", { value: 'tree', text: 'Tree' });
		viewModeSelect.createEl("option", { value: 'table-a', text: 'Table FullView' });
		viewModeSelect.createEl("option", { value: 'table-b', text: 'Table FolderView' });
		viewModeSelect.value = this.viewMode;
		viewModeSelect.onchange = async () => {
			await this.onViewModeChange(viewModeSelect.value as ViewMode);
		};
	}

	private renderInteractiveToggle(container: HTMLElement): void {
		const interactiveGroup = container.createDiv({ cls: 'settings-group' });
		interactiveGroup.createEl("label", { text: "interactive", cls: 'settings-label' });
		const interactiveToggle = interactiveGroup.createDiv({ cls: 'settings-toggle' });
		
		const onBtn = interactiveToggle.createEl("button", {
			text: "● ON",
			cls: this.config.interactive ? 'toggle-btn active' : 'toggle-btn'
		});
		onBtn.onclick = async () => {
			await this.onConfigChange({ interactive: true });
		};
		
		const offBtn = interactiveToggle.createEl("button", {
			text: "○ OFF",
			cls: !this.config.interactive ? 'toggle-btn active' : 'toggle-btn'
		});
		offBtn.onclick = async () => {
			await this.onConfigChange({ interactive: false });
		};
	}

	private renderStartShowLevelSpinner(container: HTMLElement): void {
		const showLevelGroup = container.createDiv({ cls: 'settings-group' });
		showLevelGroup.createEl("label", { text: "start show level", cls: 'settings-label' });
		const spinner = new Spinner(
			"",
			this.config.startShowLevel,
			0,
			10,
			async (value) => {
				await this.onConfigChange({ startShowLevel: value });
			}
		);
		showLevelGroup.appendChild(spinner.render());
	}

	private renderLevelNumberedSpinner(container: HTMLElement): void {
		const numberingGroup = container.createDiv({ cls: 'settings-group' });
		numberingGroup.createEl("label", { text: "level numbered", cls: 'settings-label' });
		const spinner = new Spinner(
			"",
			this.config.levelNumbered,
			0,
			10,
			async (value) => {
				await this.onConfigChange({ levelNumbered: value });
			}
		);
		numberingGroup.appendChild(spinner.render());
	}

	private renderOffsetSpinner(container: HTMLElement): void {
		const offsetGroup = container.createDiv({ cls: 'settings-group' });
		offsetGroup.createEl("label", { text: "offset", cls: 'settings-label' });
		const spinner = new Spinner(
			"",
			this.levelNumberOffset,
			0,
			10,
			async (value) => {
				await this.onOffsetChange(value);
			}
		);
		offsetGroup.appendChild(spinner.render());
	}
}
