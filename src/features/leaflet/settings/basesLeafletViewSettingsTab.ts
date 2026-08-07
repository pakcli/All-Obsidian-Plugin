/* eslint-disable obsidianmd/no-unsupported-api */
import { Notice, PluginSettingTab, SettingGroup } from "obsidian";
import { Constants as C } from "@plugin/constants";
import { t } from "@plugin/i18n/locale";
import { BasesLeafletViewPlugin } from "@plugin/plugin";
import { IconifyJSONIconsObject } from "@plugin/types";
import { SchemaValidator } from "@plugin/validation/schemaValidators";
import { LoadedIconSetsComponent } from "./loadedIconSetsComponent";
import { SettingsManager } from "./settingsManager";

export class BasesLeafletViewSettingsTab extends PluginSettingTab {
	constructor(
		public override plugin: BasesLeafletViewPlugin,
		private manager: SettingsManager,
	) {
		super(plugin.app, plugin);
	}

	override display(containerEl: HTMLElement = this.containerEl): void {
		this.containerEl = containerEl;
		this.containerEl.empty();
		this.addToolsGroup();
		this.addOsmGroup();
		this.addIconsGroup();
	}

	private addToolsGroup(): void {
		new SettingGroup(this.containerEl)
			.setHeading(t("settings.tools.title"))
			.addSetting((setting) => {
				setting
					.setName(t("settings.tools.measure.title"))
					.setDesc(t("settings.tools.measure.description"))
					.addToggle((toggle) =>
						toggle.setValue(this.manager.settings.enableMeasureTool).onChange(async (value) => {
							await this.manager.updateSettings({ enableMeasureTool: value });
						}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName(t("settings.tools.copy.title"))
					.setDesc(t("settings.tools.copy.description"))
					.addToggle((toggle) =>
						toggle.setValue(this.manager.settings.enableCopyTool).onChange(async (value) => {
							await this.manager.updateSettings({ enableCopyTool: value });
						}),
					);
			});
	}

	private addOsmGroup(): void {
		new SettingGroup(this.containerEl)
			.setHeading(t("settings.osm.title"))
			.addSetting((setting) => {
				setting
					.setName(t("settings.osm.defaultUrl.title"))
					.setDesc(t("settings.osm.defaultUrl.description"))
					.addText((text) =>
						text
							.setPlaceholder(t("settings.osm.defaultUrl.placeholder"))
							.setValue(this.manager.settings.defaultOsm)
							.onChange(async (value) => {
								await this.manager.updateSettings({ defaultOsm: value });
							}),
					);
			})
			.addSetting((setting) => {
				setting
					.setName(t("settings.osm.tileTheme.title"))
					.setDesc(t("settings.osm.tileTheme.description"))
					.addDropdown((dropdown) =>
						dropdown
							.addOption("auto", t("settings.osm.tileTheme.options.auto"))
							.addOption("light", t("settings.osm.tileTheme.options.light"))
							.addOption("dark", t("settings.osm.tileTheme.options.dark"))
							.setValue(this.manager.settings.tileTheme)
							.onChange(async (value) => {
								await this.manager.updateSettings({
									tileTheme: value as "auto" | "light" | "dark",
								});
							}),
					);
			});
	}

	private addIconsGroup(): void {
		let loadedIcons: LoadedIconSetsComponent;
		new SettingGroup(this.containerEl)
			.setHeading("Additional icon sets")
			.addSetting((setting) => {
				const fragment = new DocumentFragment();
				fragment.createSpan({ text: "" }, (span) => {
					span.append(`${t("settings.icons.add.description.start")} `);
					span.createEl("a", {
						text: t("settings.icons.add.description.previewLink"),
						href: C.settings.links.preview,
					});
					span.append(` ${t("settings.icons.add.description.middle")} `);
					span.createEl("a", {
						text: t("settings.icons.add.description.githubLink"),
						href: C.settings.links.github,
					});
					span.append(` ${t("settings.icons.add.description.end")}`);
					span.createEl("br");
					span.createEl("br");
					span.createEl("i", { text: t("settings.icons.add.description.warning") });
				});
				setting
					.setName("Add iconify icon set")
					.setDesc(fragment)
					.addButton(async (button) => {
						const input = button.buttonEl.createEl("input", {
							type: "file",
							attr: { accept: ".json", style: "display: none;" },
						});
						input.onchange = async () => {
							if (!input.files?.length) return;

							await this.plugin.iconManager.reload(async () => {
								const data: IconifyJSONIconsObject[] = this.manager.settings.iconData;
								try {
									for (let file of Array.from(input.files ?? [])) {
										const text = await file.text();
										const json: unknown = JSON.parse(text);
										if (SchemaValidator.icon(json)) data.push(json);
										else throw new Error(`Invalid IconSet: ${text}`);
									}
								} catch (error) {
									new Notice(t("settings.icons.add.error"));
									console.error(error);
								}

								input.value = "";
								await this.manager.updateSettings({ iconData: data });
								loadedIcons?.render();
							});
						};
						button.setButtonText(t("settings.icons.add.buttonText")).onClick(() => {
							input.click();
						});
					});
			})
			.addSetting((setting) => {
				setting.setClass("bases-leaflet-view-setting-empty");
				loadedIcons = new LoadedIconSetsComponent(setting.settingEl, this.plugin);
			});
	}
}
