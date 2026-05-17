/**
 * Handles touch events for mobile gestures (swipe, long press, etc.)
 */
export class TouchHandler {
	private touchStartX: number = 0;
	private touchStartY: number = 0;
	private touchStartTime: number = 0;
	private swipeThreshold: number = 50; // Minimum distance for swipe (px)
	private longPressThreshold: number = 500; // Minimum time for long press (ms)

	/**
	 * Handle touch start event
	 */
	handleTouchStart(e: TouchEvent): void {
		this.touchStartX = e.touches[0].clientX;
		this.touchStartY = e.touches[0].clientY;
		this.touchStartTime = Date.now();
	}

	/**
	 * Handle touch end event and detect gestures
	 * @returns Gesture type: 'swipe-right', 'swipe-left', 'long-press', or null
	 */
	handleTouchEnd(e: TouchEvent): { type: string; deltaX: number; deltaY: number; duration: number } | null {
		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;
		const touchEndTime = Date.now();

		const deltaX = touchEndX - this.touchStartX;
		const deltaY = touchEndY - this.touchStartY;
		const duration = touchEndTime - this.touchStartTime;

		// Detect swipe (horizontal movement > vertical movement)
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.swipeThreshold) {
			if (deltaX > 0) {
				return { type: 'swipe-right', deltaX, deltaY, duration };
			} else {
				return { type: 'swipe-left', deltaX, deltaY, duration };
			}
		}

		// Detect long press (minimal movement, long duration)
		if (duration > this.longPressThreshold && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
			return { type: 'long-press', deltaX, deltaY, duration };
		}

		return null;
	}

	/**
	 * Set swipe threshold (minimum distance for swipe detection)
	 */
	setSwipeThreshold(threshold: number): void {
		this.swipeThreshold = threshold;
	}

	/**
	 * Set long press threshold (minimum time for long press detection)
	 */
	setLongPressThreshold(threshold: number): void {
		this.longPressThreshold = threshold;
	}
}
