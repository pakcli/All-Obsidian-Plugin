import { Platform } from 'obsidian';

/**
 * Utility class for detecting mobile devices and screen sizes
 */
export class MobileDetector {
	/**
	 * Check if current device is mobile (screen width < 768px)
	 */
	static isMobile(): boolean {
		return Platform.isMobile || window.innerWidth < 768;
	}

	/**
	 * Check if current device is tablet (768px <= width < 1024px)
	 */
	static isTablet(): boolean {
		return window.innerWidth >= 768 && window.innerWidth < 1024;
	}

	/**
	 * Check if current device is desktop (width >= 1024px)
	 */
	static isDesktop(): boolean {
		return Platform.isDesktop || window.innerWidth >= 1024;
	}

	/**
	 * Check if device supports touch events
	 */
	static isTouchDevice(): boolean {
		return Platform.isMobile || 'ontouchstart' in window;
	}

	/**
	 * Check if device is iOS (iPhone, iPad, iPod)
	 */
	static isIOS(): boolean {
		return Platform.isIosApp;
	}

	/**
	 * Check if device is Android
	 */
	static isAndroid(): boolean {
		return Platform.isAndroidApp;
	}

	/**
	 * Get current screen width
	 */
	static getScreenWidth(): number {
		return window.innerWidth;
	}

	/**
	 * Get current screen height
	 */
	static getScreenHeight(): number {
		return window.innerHeight;
	}

	/**
	 * Check if device is in portrait orientation
	 */
	static isPortrait(): boolean {
		return window.innerHeight > window.innerWidth;
	}

	/**
	 * Check if device is in landscape orientation
	 */
	static isLandscape(): boolean {
		return window.innerWidth > window.innerHeight;
	}
}
