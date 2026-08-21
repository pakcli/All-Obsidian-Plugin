---
title: "Symlink Manager"
---

# Feature: Symlink Manager

**Symlink Manager** allows you to create and monitor [[symlink|symbolic links (symlinks)]] and Windows directory [[junction|junctions]] inside your [[obsidian|Obsidian]] vault.

---

## 🔗 Key Capabilities

- **Link External Folders**: Mount external project folders, code repositories, or cloud drives into your [[obsidian|Obsidian]] vault using [[native directory symlinks|native directory symlinks]] without duplicating files.
- **Visual Symlink Badges**: Displays [[link badges|link badges]] (🔗) in the file explorer alongside symlinked files and folders.
- **Safe Path Resolution**: Performs safe [[path resolution|path resolution]] to ensure all backlinks, searches, and graph connections resolve cleanly across symlink boundaries.
- **1-Click Symlink Creation**: Right-click any folder or file to create a [[symlink|symlink]] to another vault destination.

---

## ⚙️ Configuration (Settings → PakCLI Suite → Symlink Manager)

- **Show Symlink Indicators**: Toggles visual [[link badges|link badges]] in [[obsidian|Obsidian]]'s file navigation tree.
- **Auto-Resolve Target Links**: Automatically resolves physical paths via [[path resolution|path resolution]] when clicking note links.
- **Windows Junction Support**: Allows seamless folder [[junction|junctions]] on Windows without requiring Administrator privilege escalation.
