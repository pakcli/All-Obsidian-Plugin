import { Notice } from 'obsidian';
import type PakCLIPlugin from '../../main';
import { DEFAULT_SETTINGS, PakCLIPluginSettings } from '../../settings';
import { MultiProfileStorage, ProfileSwitchEvent, SlotMetadata, SlotRecord } from './types';

export const SCHEMA_VERSION = 1;
export const DEFAULT_SLOT_ID = 'default';

export class ProfileManager {
    private plugin: PakCLIPlugin;
    private storage: MultiProfileStorage = {
        activeSlot: DEFAULT_SLOT_ID,
        slots: {},
        schemaVersion: SCHEMA_VERSION
    };

    private switchListeners: Array<(event: ProfileSwitchEvent) => void> = [];
    private changeListeners: Array<() => void> = [];

    constructor(plugin: PakCLIPlugin) {
        this.plugin = plugin;
    }

    /**
     * Initializes storage from raw data.json content.
     * Performs automatic migration if legacy flat settings are detected.
     */
    async init(rawData: unknown): Promise<PakCLIPluginSettings> {
        if (this.isMultiProfileStorage(rawData)) {
            this.storage = rawData;
            if (!this.storage.slots || Object.keys(this.storage.slots).length === 0) {
                this.storage.slots = {
                    [DEFAULT_SLOT_ID]: {
                        meta: this.createMeta(DEFAULT_SLOT_ID, 'Default Profile'),
                        data: {}
                    }
                };
            }
            if (!this.storage.activeSlot || !this.storage.slots[this.storage.activeSlot]) {
                this.storage.activeSlot = Object.keys(this.storage.slots)[0] || DEFAULT_SLOT_ID;
            }
        } else {
            // Legacy data migration: rawData is flat settings or empty
            const legacyData = (rawData && typeof rawData === 'object') ? (rawData as Partial<PakCLIPluginSettings>) : {};
            this.storage = {
                activeSlot: DEFAULT_SLOT_ID,
                slots: {
                    [DEFAULT_SLOT_ID]: {
                        meta: this.createMeta(DEFAULT_SLOT_ID, 'Default Profile', 'Migrated initial profile'),
                        data: legacyData
                    }
                },
                schemaVersion: SCHEMA_VERSION
            };
            await this.persist();
        }

        const activeSlot = this.getActiveSlot();
        return Object.assign({}, DEFAULT_SETTINGS, activeSlot.data || {});
    }

    private isMultiProfileStorage(data: unknown): data is MultiProfileStorage {
        if (!data || typeof data !== 'object') return false;
        const candidate = data as Partial<MultiProfileStorage>;
        return typeof candidate.activeSlot === 'string' && typeof candidate.slots === 'object' && candidate.slots !== null;
    }

    private createMeta(id: string, name: string, description?: string): SlotMetadata {
        const now = Date.now();
        return {
            id,
            name: name.trim() || id,
            description: description ? description.trim() : undefined,
            createdAt: now,
            updatedAt: now
        };
    }

    async persist(): Promise<void> {
        // Save complete MultiProfileStorage to Obsidian data.json
        await this.plugin.saveRawStorage(this.storage);
        this.notifyChange();
    }

    getActiveSlotId(): string {
        return this.storage.activeSlot;
    }

    getActiveSlot(): SlotRecord {
        let slot = this.storage.slots[this.storage.activeSlot];
        if (!slot) {
            const firstId = Object.keys(this.storage.slots)[0] || DEFAULT_SLOT_ID;
            if (!this.storage.slots[firstId]) {
                this.storage.slots[firstId] = {
                    meta: this.createMeta(firstId, 'Default Profile'),
                    data: {}
                };
            }
            this.storage.activeSlot = firstId;
            slot = this.storage.slots[firstId];
        }
        return slot;
    }

    getSlot(id: string): SlotRecord | undefined {
        return this.storage.slots[id];
    }

    listSlots(): SlotRecord[] {
        return Object.values(this.storage.slots).sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
    }

    /**
     * Saves currently active in-memory settings into the active slot and persists to disk.
     */
    async saveActiveSlotData(currentSettings: Partial<PakCLIPluginSettings>): Promise<void> {
        const active = this.getActiveSlot();
        active.data = Object.assign({}, currentSettings);
        active.meta.updatedAt = Date.now();
        await this.persist();
    }

    /**
     * Create a new profile slot
     */
    async createSlot(id: string, name: string, description?: string, cloneCurrent = true): Promise<SlotRecord> {
        const cleanId = this.sanitizeSlotId(id);
        if (!cleanId) {
            throw new Error('Slot ID cannot be empty and must contain alphanumeric characters or hyphens/underscores.');
        }
        if (this.storage.slots[cleanId]) {
            throw new Error(`A save slot with ID "${cleanId}" already exists.`);
        }

        const data = cloneCurrent ? JSON.parse(JSON.stringify(this.plugin.settings || DEFAULT_SETTINGS)) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

        const newSlot: SlotRecord = {
            meta: this.createMeta(cleanId, name || cleanId, description),
            data
        };

        this.storage.slots[cleanId] = newSlot;
        await this.persist();
        new Notice(`Created save slot: ${newSlot.meta.name}`);
        return newSlot;
    }

    /**
     * Duplicate an existing slot
     */
    async duplicateSlot(sourceId: string, newId: string, newName?: string): Promise<SlotRecord> {
        const source = this.storage.slots[sourceId];
        if (!source) {
            throw new Error(`Source slot "${sourceId}" not found.`);
        }

        const cleanId = this.sanitizeSlotId(newId);
        if (!cleanId) {
            throw new Error('New slot ID cannot be empty.');
        }
        if (this.storage.slots[cleanId]) {
            throw new Error(`A save slot with ID "${cleanId}" already exists.`);
        }

        const newSlot: SlotRecord = {
            meta: this.createMeta(cleanId, newName || `${source.meta.name} (Copy)`, source.meta.description),
            data: JSON.parse(JSON.stringify(source.data))
        };

        this.storage.slots[cleanId] = newSlot;
        await this.persist();
        new Notice(`Duplicated slot to "${newSlot.meta.name}"`);
        return newSlot;
    }

    /**
     * Rename or update description of an existing slot
     */
    async renameSlot(id: string, newName: string, newDescription?: string): Promise<void> {
        const slot = this.storage.slots[id];
        if (!slot) {
            throw new Error(`Slot "${id}" not found.`);
        }
        slot.meta.name = newName.trim() || slot.meta.name;
        if (newDescription !== undefined) {
            slot.meta.description = newDescription.trim() || undefined;
        }
        slot.meta.updatedAt = Date.now();
        await this.persist();
        new Notice(`Updated profile "${slot.meta.name}"`);
    }

    /**
     * Switch active profile slot
     */
    async switchSlot(id: string): Promise<boolean> {
        if (id === this.storage.activeSlot) {
            new Notice(`Already using slot "${this.getActiveSlot().meta.name}".`);
            return false;
        }

        const targetSlot = this.storage.slots[id];
        if (!targetSlot) {
            new Notice(`Save slot "${id}" not found.`);
            return false;
        }

        // Before switching, save current in-memory settings to current active slot
        if (this.plugin.settings) {
            const currentSlot = this.getActiveSlot();
            currentSlot.data = Object.assign({}, this.plugin.settings);
            currentSlot.meta.updatedAt = Date.now();
        }

        const prevId = this.storage.activeSlot;
        this.storage.activeSlot = id;
        targetSlot.meta.updatedAt = Date.now();

        // Apply new slot settings to plugin in-memory state
        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, targetSlot.data || {});

        await this.persist();

        // Notify listeners and refresh subsystems
        const event: ProfileSwitchEvent = {
            previousSlot: prevId,
            currentSlot: id,
            slot: targetSlot
        };

        for (const listener of this.switchListeners) {
            try {
                listener(event);
            } catch (err) {
                console.error('[ProfileManager] Error in switch listener:', err);
            }
        }

        new Notice(`Switched profile to "${targetSlot.meta.name}"`);
        return true;
    }

    /**
     * Delete a slot
     */
    async deleteSlot(id: string): Promise<boolean> {
        if (Object.keys(this.storage.slots).length <= 1) {
            new Notice('Cannot delete the only remaining profile slot.');
            return false;
        }

        const slotToDelete = this.storage.slots[id];
        if (!slotToDelete) {
            new Notice(`Slot "${id}" not found.`);
            return false;
        }

        const wasActive = (this.storage.activeSlot === id);
        delete this.storage.slots[id];

        if (wasActive) {
            const nextId = Object.keys(this.storage.slots)[0];
            this.storage.activeSlot = nextId;
            const nextSlot = this.storage.slots[nextId];
            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, nextSlot.data || {});
            new Notice(`Active slot deleted. Switched to "${nextSlot.meta.name}".`);
        }

        await this.persist();
        new Notice(`Deleted slot "${slotToDelete.meta.name}".`);
        return true;
    }

    /**
     * Export a slot to a standalone JSON string
     */
    exportSlot(id: string): string {
        const slot = this.storage.slots[id];
        if (!slot) {
            throw new Error(`Slot "${id}" not found.`);
        }
        return JSON.stringify(slot, null, 2);
    }

    /**
     * Import a slot from JSON
     */
    async importSlot(jsonStr: string, customId?: string): Promise<SlotRecord> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            throw new Error('Invalid JSON format.');
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Imported data must be an object.');
        }

        const raw = parsed as Record<string, unknown>;
        let targetId = customId || (raw.meta && typeof raw.meta === 'object' && (raw.meta as Record<string, unknown>).id ? String((raw.meta as Record<string, unknown>).id) : `imported-${Date.now()}`);
        targetId = this.sanitizeSlotId(targetId);

        // Disallow collision by suffixing if needed
        let finalId = targetId;
        let counter = 1;
        while (this.storage.slots[finalId]) {
            finalId = `${targetId}-${counter++}`;
        }

        const name = (raw.meta && typeof raw.meta === 'object' && (raw.meta as Record<string, unknown>).name)
            ? String((raw.meta as Record<string, unknown>).name)
            : `Imported (${finalId})`;

        const desc = (raw.meta && typeof raw.meta === 'object' && (raw.meta as Record<string, unknown>).description)
            ? String((raw.meta as Record<string, unknown>).description)
            : 'Imported from JSON';

        const data = (raw.data && typeof raw.data === 'object') ? (raw.data as Partial<PakCLIPluginSettings>) : (raw as Partial<PakCLIPluginSettings>);

        const newSlot: SlotRecord = {
            meta: this.createMeta(finalId, name, desc),
            data
        };

        this.storage.slots[finalId] = newSlot;
        await this.persist();
        new Notice(`Imported save slot: "${name}"`);
        return newSlot;
    }

    /**
     * Direct update of raw JSON for a slot
     */
    async updateSlotRawJson(id: string, rawJsonStr: string): Promise<void> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawJsonStr);
        } catch {
            throw new Error('Invalid JSON syntax.');
        }

        const slot = this.storage.slots[id];
        if (!slot) {
            throw new Error(`Slot "${id}" not found.`);
        }

        if (parsed && typeof parsed === 'object' && 'data' in parsed) {
            slot.data = (parsed as { data: Partial<PakCLIPluginSettings> }).data || {};
            if ('meta' in parsed && (parsed as { meta: Partial<SlotMetadata> }).meta) {
                const meta = (parsed as { meta: Partial<SlotMetadata> }).meta;
                if (meta.name) slot.meta.name = meta.name;
                if (meta.description !== undefined) slot.meta.description = meta.description;
            }
        } else if (parsed && typeof parsed === 'object') {
            slot.data = parsed as Partial<PakCLIPluginSettings>;
        }

        slot.meta.updatedAt = Date.now();

        if (id === this.storage.activeSlot) {
            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, slot.data || {});
        }

        await this.persist();
        new Notice(`Saved raw JSON for slot "${slot.meta.name}".`);
    }

    sanitizeSlotId(id: string): string {
        return id.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    onProfileSwitched(listener: (event: ProfileSwitchEvent) => void): () => void {
        this.switchListeners.push(listener);
        return () => {
            this.switchListeners = this.switchListeners.filter(l => l !== listener);
        };
    }

    onProfilesChanged(listener: () => void): () => void {
        this.changeListeners.push(listener);
        return () => {
            this.changeListeners = this.changeListeners.filter(l => l !== listener);
        };
    }

    private notifyChange(): void {
        for (const listener of this.changeListeners) {
            try {
                listener();
            } catch (err) {
                console.error('[ProfileManager] Error in change listener:', err);
            }
        }
    }
}
