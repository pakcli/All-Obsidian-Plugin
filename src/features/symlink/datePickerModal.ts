import { App, ButtonComponent, Modal } from 'obsidian';

export class DatePickerModal extends Modal {
	private dateValue: string;
	private onSelect: (dateStr: string) => void;

	constructor(app: App, defaultDate: string, onSelect: (dateStr: string) => void) {
		super(app);
		this.dateValue = defaultDate;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText('Pick a date');
		this.modalEl.addClass('date-picker-modal');
		contentEl.empty();

		const container = contentEl.createDiv({ cls: 'date-picker-container' });

		// Date Input element
		const inputEl = container.createEl('input', {
			cls: 'date-picker-input'
		});
		inputEl.setAttribute('type', 'date');
		inputEl.value = this.dateValue;

		inputEl.addEventListener('change', (e) => {
			this.dateValue = (e.target as HTMLInputElement).value;
		});

		// Focus on open
		setTimeout(() => inputEl.focus(), 50);

		// Handle keydown events inside the input element
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});

		// Button row
		const btnContainer = container.createDiv({ cls: 'date-picker-buttons' });

		new ButtonComponent(btnContainer)
			.setButtonText('Insert')
			.setCta()
			.onClick(() => {
				this.submit();
			});

		new ButtonComponent(btnContainer)
			.setButtonText('Cancel')
			.onClick(() => {
				this.close();
			});
	}

	private submit(): void {
		if (this.dateValue) {
			this.onSelect(this.dateValue);
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
