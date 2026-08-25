import { App, FuzzySuggestModal, Modal, Notice, Setting } from 'obsidian';
import type PakCLIPlugin from '../../../main';
import { ProfileManager } from '../ProfileManager';
import { SlotRecord } from '../types';
import { ProfileManagerTabRenderer } from './ProfileManagerTab';

export class ProfileManagerModal extends Modal {
    private plugin: PakCLIPlugin;
    private manager: ProfileManager;

    constructor(app: App, plugin: PakCLIPlugin, manager: ProfileManager) {
        super(app);
        this.plugin = plugin;
        this.manager = manager;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        new ProfileManagerTabRenderer(this.app, this.plugin, this.manager).render(contentEl);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class CreateProfileModal extends Modal {
    private manager: ProfileManager;
    private onSuccess?: (slot: SlotRecord) => void;
    private id = '';
    private name = '';
    private description = '';
    private copyCurrent = true;

    constructor(app: App, manager: ProfileManager, onSuccess?: (slot: SlotRecord) => void) {
        super(app);
        this.manager = manager;
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Create Save Slot / Profile' });

        new Setting(contentEl)
            .setName('Profile Name')
            .setDesc('Display name for this profile state.')
            .addText(text => {
                text.setPlaceholder('e.g. Work Vault, Project Alpha')
                    .onChange(val => {
                        this.name = val;
                        if (!this.id || this.id.startsWith('profile-')) {
                            this.id = val.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                            idInput.setValue(this.id);
                        }
                    });
                text.inputEl.focus();
            });

        let idInput: { setValue: (v: string) => void };
        new Setting(contentEl)
            .setName('Slot Identifier (ID)')
            .setDesc('Unique identifier key for internal storage.')
            .addText(text => {
                idInput = text;
                text.setPlaceholder('e.g. project-alpha')
                    .setValue(this.id)
                    .onChange(val => {
                        this.id = val;
                    });
            });

        new Setting(contentEl)
            .setName('Description')
            .setDesc('Optional notes or purpose of this profile.')
            .addText(text => {
                text.setPlaceholder('e.g. Configured with dark theme and custom SQL configs')
                    .onChange(val => {
                        this.description = val;
                    });
            });

        new Setting(contentEl)
            .setName('Clone Current Active Settings')
            .setDesc('If enabled, starts with a snapshot of current settings. If disabled, starts with defaults.')
            .addToggle(toggle => {
                toggle.setValue(this.copyCurrent)
                    .onChange(val => {
                        this.copyCurrent = val;
                    });
            });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .addButton(btn => {
                btn.setButtonText('Create Slot')
                    .setCta()
                    .onClick(async () => {
                        if (!this.name.trim()) {
                            new Notice('Please provide a profile name.');
                            return;
                        }
                        const finalId = this.id.trim() || this.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
                        try {
                            const newSlot = await this.manager.createSlot(finalId, this.name, this.description, this.copyCurrent);
                            this.close();
                            if (this.onSuccess) this.onSuccess(newSlot);
                        } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : String(err);
                            new Notice(`Error: ${message}`);
                        }
                    });
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class RenameProfileModal extends Modal {
    private manager: ProfileManager;
    private slot: SlotRecord;
    private name: string;
    private description: string;
    private onSuccess?: () => void;

    constructor(app: App, manager: ProfileManager, slot: SlotRecord, onSuccess?: () => void) {
        super(app);
        this.manager = manager;
        this.slot = slot;
        this.name = slot.meta.name;
        this.description = slot.meta.description || '';
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: `Edit Profile: ${this.slot.meta.name}` });

        new Setting(contentEl)
            .setName('Profile Name')
            .addText(text => {
                text.setValue(this.name)
                    .onChange(val => {
                        this.name = val;
                    });
                text.inputEl.focus();
            });

        new Setting(contentEl)
            .setName('Description')
            .addText(text => {
                text.setValue(this.description)
                    .onChange(val => {
                        this.description = val;
                    });
            });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .addButton(btn => {
                btn.setButtonText('Save Changes')
                    .setCta()
                    .onClick(async () => {
                        if (!this.name.trim()) {
                            new Notice('Profile name cannot be empty.');
                            return;
                        }
                        try {
                            await this.manager.renameSlot(this.slot.meta.id, this.name, this.description);
                            this.close();
                            if (this.onSuccess) this.onSuccess();
                        } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : String(err);
                            new Notice(`Error: ${message}`);
                        }
                    });
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class InspectJsonModal extends Modal {
    private manager: ProfileManager;
    private slot: SlotRecord;
    private jsonContent: string;
    private onSuccess?: () => void;

    constructor(app: App, manager: ProfileManager, slot: SlotRecord, onSuccess?: () => void) {
        super(app);
        this.manager = manager;
        this.slot = slot;
        this.jsonContent = JSON.stringify(slot, null, 2);
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: `Raw JSON: ${this.slot.meta.name} (${this.slot.meta.id})` });

        contentEl.createEl('p', {
            text: 'You can inspect or directly modify the slot JSON configuration below. Validate JSON before saving.',
            cls: 'setting-item-description'
        });

        new Setting(contentEl)
            .setClass('profile-json-textarea-container')
            .addTextArea(text => {
                text.setValue(this.jsonContent);
                text.inputEl.rows = 18;
                text.inputEl.addClass('profile-json-textarea');
                text.onChange(val => {
                    this.jsonContent = val;
                });
            });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Copy to Clipboard')
                    .setIcon('copy')
                    .onClick(() => {
                        navigator.clipboard.writeText(this.jsonContent);
                        new Notice('Copied JSON to clipboard!');
                    });
            })
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .addButton(btn => {
                btn.setButtonText('Save Changes')
                    .setCta()
                    .onClick(async () => {
                        try {
                            JSON.parse(this.jsonContent);
                        } catch {
                            new Notice('Invalid JSON format! Please check syntax.');
                            return;
                        }

                        try {
                            await this.manager.updateSlotRawJson(this.slot.meta.id, this.jsonContent);
                            this.close();
                            if (this.onSuccess) this.onSuccess();
                        } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : String(err);
                            new Notice(`Error: ${message}`);
                        }
                    });
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class ImportProfileModal extends Modal {
    private manager: ProfileManager;
    private jsonContent = '';
    private onSuccess?: (slot: SlotRecord) => void;

    constructor(app: App, manager: ProfileManager, onSuccess?: (slot: SlotRecord) => void) {
        super(app);
        this.manager = manager;
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Import Profile from JSON' });

        contentEl.createEl('p', {
            text: 'Paste exported profile JSON or raw settings JSON object below to create a new slot.',
            cls: 'setting-item-description'
        });

        new Setting(contentEl)
            .addTextArea(text => {
                text.setPlaceholder('{\n  "meta": { ... },\n  "data": { ... }\n}')
                    .setValue(this.jsonContent);
                text.inputEl.rows = 14;
                text.inputEl.addClass('profile-json-textarea');
                text.onChange(val => {
                    this.jsonContent = val;
                });
            });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => this.close());
            })
            .addButton(btn => {
                btn.setButtonText('Import Profile')
                    .setCta()
                    .onClick(async () => {
                        if (!this.jsonContent.trim()) {
                            new Notice('Please paste JSON data.');
                            return;
                        }

                        try {
                            const newSlot = await this.manager.importSlot(this.jsonContent);
                            this.close();
                            if (this.onSuccess) this.onSuccess(newSlot);
                        } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : String(err);
                            new Notice(`Import error: ${message}`);
                        }
                    });
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class QuickSwitchProfileModal extends FuzzySuggestModal<SlotRecord> {
    private manager: ProfileManager;
    private onSelected?: (slot: SlotRecord) => void;

    constructor(app: App, manager: ProfileManager, onSelected?: (slot: SlotRecord) => void) {
        super(app);
        this.manager = manager;
        this.onSelected = onSelected;
        this.setPlaceholder('Type to search profile save slots...');
    }

    getItems(): SlotRecord[] {
        return this.manager.listSlots();
    }

    getItemText(slot: SlotRecord): string {
        const isActive = (slot.meta.id === this.manager.getActiveSlotId());
        const activePrefix = isActive ? '[Active] ' : '';
        return `${activePrefix}${slot.meta.name} (${slot.meta.id}) ${slot.meta.description || ''}`.trim();
    }

    renderSuggestion(item: { item: SlotRecord; match: unknown }, el: HTMLElement): void {
        const slot = item.item;
        const isActive = (slot.meta.id === this.manager.getActiveSlotId());

        el.empty();
        const container = el.createDiv({ cls: 'profile-suggest-item' });

        const info = container.createDiv();
        info.createDiv({
            cls: `profile-suggest-title ${isActive ? 'is-active' : ''}`,
            text: slot.meta.name
        });

        if (slot.meta.description) {
            info.createDiv({
                text: slot.meta.description,
                cls: 'setting-item-description profile-suggest-desc'
            });
        }

        const dateEl = container.createDiv({ cls: 'setting-item-description profile-suggest-date' });
        dateEl.setText(new Date(slot.meta.updatedAt).toLocaleDateString());
    }

    onChooseItem(slot: SlotRecord): void {
        this.manager.switchSlot(slot.meta.id).then(switched => {
            if (switched && this.onSelected) {
                this.onSelected(slot);
            }
        });
    }
}
