import "obsidian";

declare module "obsidian" {
    export class SettingGroup {
        listEl: HTMLElement;
        constructor(containerEl: HTMLElement);
        setHeading(text: string): this;
        addSetting(cb: (setting: Setting) => void): this;
    }
}
