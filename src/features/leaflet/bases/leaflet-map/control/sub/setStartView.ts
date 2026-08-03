import { DomEvent, DomUtil, LeafletMouseEvent } from "leaflet";
import { Notice } from "obsidian";
import { Constants as C } from "@plugin/constants";
import { t } from "@plugin/i18n/locale";
import { getIconWithDefault } from "@plugin/util";
import { SubControl } from "../subControl";

// Action button: writes the current map center + zoom back to the view config
// (startCoordinate and defaultZoom), so the saved values become the new start view.
export class SetStartViewControl extends SubControl {
	override onAdd(containerEl: HTMLElement): void {
		this.button = DomUtil.create("button", "leaflet-control-button", containerEl);
		this.button.appendChild(getIconWithDefault(C.map.controlIcons.setStartView));
		this.button.ariaLabel = t("map.controls.setStartView.label");
		this.button.addEventListener("click", () => this.setStartView());
		DomEvent.disableClickPropagation(this.button);
	}

	override mapClicked(_event: LeafletMouseEvent): void {
		// no-op: this control doesn't react to map clicks
	}

	private normalizeLng(lng: number): number {
		return (((lng + 180) % 360) + 360) % 360 - 180;
	}

	private setStartView(): void {
		if (!this.setConfig) {
			new Notice(t("map.controls.setStartView.notice.failure"));
			return;
		}

		const center = this.map.getCenter();
		const lat = center.lat.toFixed(5);
		const lng = this.normalizeLng(center.lng).toFixed(5);
		const zoom = this.map.getZoom().toFixed(2);

		try {
			this.setConfig(C.view.obsidianIdentifiers.startCoordinate, `${lat}, ${lng}`);
			this.setConfig(C.view.obsidianIdentifiers.defaultZoom, zoom);
			new Notice(t("map.controls.setStartView.notice.success"));
		} catch {
			new Notice(t("map.controls.setStartView.notice.failure"));
		}
	}
}
