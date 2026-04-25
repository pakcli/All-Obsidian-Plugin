/**
 * Middle-ellipsis a path so it fits the element's current width.
 * Re-runs whenever the element resizes.
 *
 *   wide     →  D:\Projects\Foo\Bar\baz
 *   medium   →  D:\Projects\…\baz
 *   tiny     →  D:\…
 *
 * Returns a disposer so callers can disconnect the observer on teardown.
 */
export function applyResponsivePath(el: HTMLElement, full: string): () => void {
	el.dataset.fullPath = full;

	const compute = (): void => {
		const width = el.clientWidth;
		if (width <= 0) return;

		const charPx = estimateCharPx(el);
		const max = Math.max(3, Math.floor(width / charPx));

		el.textContent = squeeze(full, max);
		el.title = full;
	};

	compute();

	const ro = new ResizeObserver(compute);
	ro.observe(el);
	return () => ro.disconnect();
}

function estimateCharPx(el: HTMLElement): number {
	const cs = getComputedStyle(el);
	const fontSize = parseFloat(cs.fontSize) || 13;
	// Monospace fonts run ~0.6em per char; proportional UI fonts ~0.55em.
	const factor = /mono/i.test(cs.fontFamily) ? 0.6 : 0.55;
	return Math.max(5, fontSize * factor);
}

function squeeze(full: string, max: number): string {
	if (full.length <= max) return full;

	const sepRx = /[\\/]/;
	const segments = full.split(sepRx);
	const sep = full.match(sepRx)?.[0] ?? '/';

	// Very narrow: just the root (drive letter or first segment) + ellipsis.
	if (max < 12) {
		const head = segments[0] ?? full.slice(0, 3);
		const candidate = `${head}${sep}…`;
		return candidate.length <= max ? candidate : `…${full.slice(-Math.max(1, max - 1))}`;
	}

	// Medium: keep first segment and last segment, ellipsis in the middle.
	if (segments.length >= 3) {
		const first = segments[0] ?? '';
		const last = segments[segments.length - 1] ?? '';
		const candidate = `${first}${sep}…${sep}${last}`;
		if (candidate.length <= max) return candidate;
	}

	// Fallback: simple character-level middle ellipsis.
	const half = Math.max(1, Math.floor((max - 1) / 2));
	return `${full.slice(0, half)}…${full.slice(full.length - (max - half - 1))}`;
}
