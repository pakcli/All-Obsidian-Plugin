/**
 * Attach a ResizeObserver to `el` that keeps the displayed path inside the
 * available width using four tiers (widest → narrowest):
 *
 *   full       E:\vault-ai-skill\Claude Skill
 *   compact    E:\…\Claude Skill          (drive + … + last segment)
 *   minimal    E:\vault-ai-skill\         (drive + parent segment)
 *   drive-only E:\…                       (drive letter only)
 *
 * The full path is always preserved in el.title for hover tooltip.
 * Returns a disposer — call it to disconnect the observer.
 */
export function applyResponsivePath(el: HTMLElement, full: string): () => void {
	el.dataset.fullPath = full;
	el.title = full;

	const render = (): void => {
		const width = el.clientWidth;
		if (width <= 0) return;
		const budget = Math.max(3, Math.floor(width / measureCharPx(el)));
		el.textContent = squeeze(full, budget);
	};

	render();

	const ro = new ResizeObserver(render);
	ro.observe(el);
	return () => ro.disconnect();
}

// ─── char-width estimator ────────────────────────────────────────────────────

function measureCharPx(el: HTMLElement): number {
	const cs = getComputedStyle(el);
	const fontSize = parseFloat(cs.fontSize) || 13;
	const factor = /mono/i.test(cs.fontFamily) ? 0.60 : 0.52;
	return Math.max(4, fontSize * factor);
}

// ─── four-tier squeeze ────────────────────────────────────────────────────────

export function squeeze(full: string, budget: number): string {
	// ── Tier 0: full fits ────────────────────────────────────────────────────
	if (full.length <= budget) return full;

	const sep   = full.includes('\\') ? '\\' : '/';
	const parts = full.split(/[\\/]/);
	const [firstStr] = parts;
	const first = firstStr ?? '';                         // drive or root
	const [lastStr] = parts.slice(-1);
	const last = lastStr ?? '';                           // destination name
	const [parentStr] = parts.slice(-2);
	const parent = parts.length >= 3 ? (parentStr ?? '') : ''; // parent dir

	// ── Tier 1: compact — drive/…/destination ───────────────────────────────
	if (parts.length >= 3) {
		const t1 = `${first}${sep}…${sep}${last}`;
		if (t1.length <= budget) return t1;
	} else if (parts.length === 2) {
		// Only two segments: already as compact as it gets, skip to tier 3.
	}

	// ── Tier 2: minimal — drive/parent-dir/ ─────────────────────────────────
	if (parent) {
		const t2 = `${first}${sep}${parent}${sep}`;
		if (t2.length <= budget) return t2;
	}

	// ── Tier 3: drive-only — drive/… ────────────────────────────────────────
	const t3 = `${first}${sep}…`;
	if (t3.length <= budget) return t3;

	// ── Absolute fallback: truncate the drive letter itself ──────────────────
	return first.slice(0, Math.max(1, budget - 1)) + '…';
}
