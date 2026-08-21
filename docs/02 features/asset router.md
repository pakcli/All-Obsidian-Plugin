---
title: "Asset Router"
---

# Feature: Asset Router

**Asset Router** manages where newly pasted or dragged attachments (images, PDFs, audio, archives) are stored in your [[obsidian|vault]], ensuring a clean, organized folder structure.

---

## 📁 Key Capabilities

### 1. Centralized & Rule-Based Asset Routing
- Automatically route pasted images to a dedicated folder via [[centralized folder routing|centralized folder routing]] (e.g. `assets/` or `attachments/`).
- Define [[custom folder rules|custom folder rules]] based on file extension (e.g. all `.pdf` files go to `documents/`, while `.png`/`.jpg` go to `images/`).
- Support for [[auto subfolder mirroring|auto subfolder mirroring]] and active-note-adjacent asset folders (`./assets`).

### 2. Active Note Folder Rules
- Automatically create note-specific attachment subfolders.
- Keep media files adjacent to your notes or neatly categorized in global vault storage.

---

## ⚙️ Configuration (Settings → PakCLI Suite → Asset Router)

- **Enable Centralized Routing**: Toggle global asset routing on or off via [[centralized folder routing|centralized folder routing]].
- **Global Attachment Folder**: The target folder for general attachments.
- **Folder Rule Engine**: Add [[custom folder rules|custom folder rules]] based on specific folder origins or file formats.
