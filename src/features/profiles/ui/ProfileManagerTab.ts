import { App, ButtonComponent, Notice } from 'obsidian';
import type PakCLIPlugin from '../../../main';
import { ProfileManager } from '../ProfileManager';
import { SlotRecord } from '../types';
import { CreateProfileModal, ImportProfileModal, InspectJsonModal, QuickSwitchProfileModal, RenameProfileModal } from './ProfileModals';

export class ProfileManagerTabRenderer {
    private app: App;
    private plugin: PakCLIPlugin;
    private manager: ProfileManager;

    constructor(app: App, plugin: PakCLIPlugin, manager: ProfileManager) {
        this.app = app;
        this.plugin = plugin;
        this.manager = manager;
    }

    render(containerEl: HTMLElement): void {
        containerEl.empty();

        // 1. Header Section
        const headerEl = containerEl.createDiv({ cls: 'profile-manager-header' });
        headerEl.createEl('h2', { text: 'Save Vault Profiles & Slots' });
        
        headerEl.createEl('p', {
            text: 'Save, switch, and manage multiple independent configuration and data snapshots within this single vault.',
            cls: 'setting-item-description'
        });

        // 2. Action Bar
        const actionBar = containerEl.createDiv({ cls: 'profile-action-bar' });

        new ButtonComponent(actionBar)
            .setButtonText('Create New Slot')
            .setIcon('plus')
            .setCta()
            .onClick(() => {
                new CreateProfileModal(this.app, this.manager, () => this.render(containerEl)).open();
            });

        new ButtonComponent(actionBar)
            .setButtonText('Quick Switch (Search)')
            .setIcon('layers')
            .onClick(() => {
                new QuickSwitchProfileModal(this.app, this.manager, () => this.render(containerEl)).open();
            });

        new ButtonComponent(actionBar)
            .setButtonText('Import Profile JSON')
            .setIcon('download')
            .onClick(() => {
                new ImportProfileModal(this.app, this.manager, () => this.render(containerEl)).open();
            });

        // 3. Active Profile Banner
        const activeSlot = this.manager.getActiveSlot();
        const activeCard = containerEl.createDiv({ cls: 'profile-active-card' });

        const activeHeader = activeCard.createDiv({ cls: 'profile-active-title' });

        const activeTitleWrapper = activeHeader.createDiv();
        activeTitleWrapper.createSpan({ text: activeSlot.meta.name, cls: 'profile-active-name' });

        activeTitleWrapper.createSpan({ text: 'Active Profile', cls: 'profile-active-badge' });

        activeCard.createDiv({ text: `Slot ID: ${activeSlot.meta.id}`, cls: 'setting-item-description profile-id-sub' });

        if (activeSlot.meta.description) {
            activeCard.createDiv({ text: activeSlot.meta.description, cls: 'setting-item-description profile-desc' });
        }

        activeCard.createDiv({
            text: `Last updated: ${new Date(activeSlot.meta.updatedAt).toLocaleString()}`,
            cls: 'setting-item-description profile-date-meta'
        });

        // 4. All Profiles Section
        containerEl.createEl('h3', { text: 'All Save Slots' });

        const slots = this.manager.listSlots();
        const slotsContainer = containerEl.createDiv({ cls: 'profile-slots-list' });

        for (const slot of slots) {
            this.renderSlotRow(slotsContainer, slot, containerEl);
        }
    }

    private renderSlotRow(containerEl: HTMLElement, slot: SlotRecord, rootContainer: HTMLElement): void {
        const isActive = (slot.meta.id === this.manager.getActiveSlotId());
        const row = containerEl.createDiv({ cls: `profile-slot-row ${isActive ? 'is-active' : ''}` });

        // Left info
        const infoEl = row.createDiv();
        const titleRow = infoEl.createDiv();
        titleRow.createSpan({
            text: slot.meta.name,
            cls: `profile-slot-name ${isActive ? 'is-active' : ''}`
        });

        titleRow.createSpan({
            text: ` (${slot.meta.id})`,
            cls: 'profile-slot-id'
        });

        if (isActive) {
            titleRow.createSpan({
                text: ' ● ACTIVE',
                cls: 'profile-active-dot'
            });
        }

        if (slot.meta.description) {
            infoEl.createDiv({
                text: slot.meta.description,
                cls: 'setting-item-description profile-desc'
            });
        }

        infoEl.createDiv({
            text: `Updated: ${new Date(slot.meta.updatedAt).toLocaleString()}`,
            cls: 'setting-item-description profile-date'
        });

        // Right Actions
        const actionsEl = row.createDiv({ cls: 'profile-row-actions' });

        if (!isActive) {
            new ButtonComponent(actionsEl)
                .setButtonText('Switch')
                .setIcon('check')
                .onClick(async () => {
                    await this.manager.switchSlot(slot.meta.id);
                    this.render(rootContainer);
                });
        }

        new ButtonComponent(actionsEl)
            .setIcon('copy')
            .setTooltip('Duplicate profile')
            .onClick(() => {
                new CreateProfileModal(this.app, this.manager, () => this.render(rootContainer)).open();
            });

        new ButtonComponent(actionsEl)
            .setIcon('pencil')
            .setTooltip('Edit profile name & description')
            .onClick(() => {
                new RenameProfileModal(this.app, this.manager, slot, () => this.render(rootContainer)).open();
            });

        new ButtonComponent(actionsEl)
            .setIcon('code')
            .setTooltip('Inspect / Edit raw JSON')
            .onClick(() => {
                new InspectJsonModal(this.app, this.manager, slot, () => this.render(rootContainer)).open();
            });

        new ButtonComponent(actionsEl)
            .setIcon('share')
            .setTooltip('Export JSON to clipboard')
            .onClick(() => {
                const json = this.manager.exportSlot(slot.meta.id);
                navigator.clipboard.writeText(json);
                new Notice(`Copied "${slot.meta.name}" JSON to clipboard!`);
            });

        if (this.manager.listSlots().length > 1) {
            const delBtn = new ButtonComponent(actionsEl)
                .setIcon('trash')
                .setTooltip('Delete profile')
                .setWarning()
                .onClick(async () => {
                    if (confirm(`Are you sure you want to delete profile slot "${slot.meta.name}" (${slot.meta.id})?`)) {
                        await this.manager.deleteSlot(slot.meta.id);
                        this.render(rootContainer);
                    }
                });
            if (isActive && this.manager.listSlots().length === 1) {
                delBtn.setDisabled(true);
            }
        }
    }
}
