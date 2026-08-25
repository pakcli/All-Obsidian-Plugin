import { PakCLIPluginSettings } from '../../settings';

export interface SlotMetadata {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
}

export interface SlotRecord {
    meta: SlotMetadata;
    data: Partial<PakCLIPluginSettings>;
}

export interface MultiProfileStorage {
    activeSlot: string;
    slots: Record<string, SlotRecord>;
    schemaVersion: number;
}

export interface ProfileSwitchEvent {
    previousSlot: string;
    currentSlot: string;
    slot: SlotRecord;
}
