import { DomEvent, DomUtil, LeafletMouseEvent } from "leaflet";
import { Notice } from "obsidian";
import { Constants as C } from "@plugin/constants";
import { t } from "@plugin/i18n/locale";
import { getIconWithDefault } from "@plugin/util";
import { SubControl } from "../subControl";

// Unlike the toggle tools (pan/measure/copy), this control fires an action on click and
// never enters a selected state, so it overrides onAdd to bypass the select callback.
export class CaptureViewControl extends SubControl {
	override onAdd(containerEl: HTMLElement): void {
		this.button = DomUtil.create("button", "leaflet-control-button", containerEl);
		this.button.appendChild(getIconWithDefault(C.map.controlIcons.captureView));
		this.button.ariaLabel = t("map.controls.captureView.label");
		this.button.addEventListener("click", () => this.captureCurrentView());
		DomEvent.disableClickPropagation(this.button);
	}

	override mapClicked(_event: LeafletMouseEvent): void {
		// no-op: this control doesn't react to map clicks
	}

	private normalizeLng(lng: number): number {
		return (((lng + 180) % 360) + 360) % 360 - 180;
	}

	private captureCurrentView(): void {
		const center = this.map.getCenter();
		const lat = center.lat.toFixed(5);
		const lng = this.normalizeLng(center.lng).toFixed(5);
		const content = `${lat}, ${lng}`;
		navigator.clipboard
			.writeText(content)
			.then(() => new Notice(t("map.controls.captureView.notice.success")))
			.catch(() => new Notice(t("map.controls.captureView.notice.failure")));
	}
}