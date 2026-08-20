/**
 * Spinner component - A number input with increment/decrement buttons
 * Format: [−] value [+]
 */
export class Spinner {
	private label: string;
	private value: number;
	private min: number;
	private max: number;
	private onChange: (value: number) => void | Promise<void>;

	constructor(
		label: string,
		value: number,
		min: number,
		max: number,
		onChange: (value: number) => void | Promise<void>
	) {
		this.label = label;
		this.value = value;
		this.min = min;
		this.max = max;
		this.onChange = onChange;
	}

	/**
	 * Render the spinner element
	 */
	render(): HTMLElement {
		const spinner = createDiv({ cls: 'tree-spinner' });
		
		if (this.label) {
			const labelEl = spinner.createSpan({ text: this.label + ":" });
			labelEl.setCssStyles({ marginRight: "4px", fontSize: "11px" });
		}
		
		// Decrease button
		const decreaseBtn = spinner.createEl('button', {
			text: "−",
			cls: 'spinner-button'
		});
		decreaseBtn.onclick = () => {
			if (this.value > this.min) {
				void this.onChange(this.value - 1);
			}
		};
		
		// Value display
		spinner.createSpan({
			text: this.value.toString(),
			cls: 'spinner-value'
		});
		
		// Increase button
		const increaseBtn = spinner.createEl('button', {
			text: "+",
			cls: 'spinner-button'
		});
		increaseBtn.onclick = () => {
			if (this.value < this.max) {
				void this.onChange(this.value + 1);
			}
		};
		
		return spinner;
	}
}
