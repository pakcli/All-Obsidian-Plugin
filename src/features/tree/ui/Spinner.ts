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
		const spinner = document.createElement('div');
		spinner.className = 'tree-spinner';
		
		if (this.label) {
			const labelEl = document.createElement('span');
			labelEl.textContent = this.label + ":";
			labelEl.style.marginRight = "4px";
			labelEl.style.fontSize = "11px";
			spinner.appendChild(labelEl);
		}
		
		// Decrease button
		const decreaseBtn = document.createElement('button');
		decreaseBtn.textContent = "−";
		decreaseBtn.className = 'spinner-button';
		decreaseBtn.onclick = () => {
			if (this.value > this.min) {
				this.onChange(this.value - 1);
			}
		};
		spinner.appendChild(decreaseBtn);
		
		// Value display
		const valueEl = document.createElement('span');
		valueEl.textContent = this.value.toString();
		valueEl.className = 'spinner-value';
		spinner.appendChild(valueEl);
		
		// Increase button
		const increaseBtn = document.createElement('button');
		increaseBtn.textContent = "+";
		increaseBtn.className = 'spinner-button';
		increaseBtn.onclick = () => {
			if (this.value < this.max) {
				this.onChange(this.value + 1);
			}
		};
		spinner.appendChild(increaseBtn);
		
		return spinner;
	}
}
