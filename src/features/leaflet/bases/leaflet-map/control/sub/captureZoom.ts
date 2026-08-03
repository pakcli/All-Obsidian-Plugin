import { DomEvent, DomUtil, LeafletMouseEvent } from "leaflet";
import { Notice } from "obsidian";
import { Constants as C } from "@plugin/constants";
import { t } from "@plugin/i18n/locale";
import { getIconWithDefault } from "@plugin/util";
import { SubControl } from "../subControl";

// Action button: copies current zoom to clipboard so the user can paste it into their
// YAML as the defaultZoom. Bypasses the select-callback pattern like CaptureViewControl.
export class CaptureZoomControl extends SubControl {
	override onAdd(containerEl: HTMLElement): void {
		this.button = DomUtil.create("button", "leaflet-control-button", containerEl);
		this.button.appendChild(getIconWithDefault(C.map.controlIcons.captureZoom));
		this.button.ariaLabel = t("map.controls.captureZoom.label");
		this.button.addEventListener("click", () => this.captureCurrentZoom());
		DomEvent.disableClickPropagation(this.button);
	}

	override mapClicked(_event: LeafletMouseEvent): void {
		// no-op: this control doesn't react to map clicks
	}

	private captureCurrentZoom(): void {
		const content = this.map.getZoom().toFixed(2);
		navigator.clipboard
			.writeText(content)
			.then(() => new Notice(t("map.controls.captureZoom.notice.success")))
			.catch(() => new Notice(t("map.controls.captureZoom.notice.failure")));
	}
}
