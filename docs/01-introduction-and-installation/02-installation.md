# Installation & Getting Started

This guide explains how to install, enable, and verify **PakCLI Suite** in your [[obsidian|Obsidian]] vault on your [[computer|computer]].

---

## 📋 Prerequisites

- **[[obsidian|Obsidian]]**: Version 1.8.0 or newer.
- **[[computer|Computer]] OS**: Windows, macOS, or Linux.
- **[[internet|Internet]]**: Needed only for initial download from the [[community|community]] plugin directory or GitHub releases.

---

## 🛠️ Step-by-Step Installation

### Step 1: Open Obsidian Settings
1. Launch [[obsidian|Obsidian]].
2. Click the **Settings** gear icon (⚙️) in the bottom-left corner of Obsidian (or press `Ctrl + ,` / `Cmd + ,`).

---

### Step 2: Enable Community Plugins
1. In the Settings sidebar, navigate to **[[community|Community]] [[plugin|plugins]]**.
2. If **Restricted mode** is on, click **Turn on [[community|community]] [[plugin|plugins]]** to allow third-party extensions.

---

### Step 3: Install Plugin Files

#### Method A: Local Vault Installation (Developer / Manual)
1. Locate your vault's hidden [[plugin|plugin]] directory on your [[computer|computer]]:
   ```text
   <Your-Vault-Folder>/.obsidian/plugins/pakcli-suite/
   ```
2. Place the following release files into that folder:
   - `main.js` (The compiled [[nodejs-and-typescript|TypeScript]] code)
   - `manifest.json` (Plugin metadata)
   - `styles.css` (Plugin stylesheets)

#### Method B: Automated Deployment Script
If developing locally in this project repository, run with [[powershell|PowerShell]]:
```powershell
.\start.ps1
```
Select `[0]` to automatically build and copy all release artifacts directly into your vault [[plugin|plugin]] directory.

---

### Step 4: Enable the Plugin
1. Go to **Settings → [[community|Community]] [[plugin|plugins]]**.
2. Under **Installed [[plugin|plugins]]**, click **Check for updates** or reload the page.
3. Locate **PakCLI Editor's Choice** (or **PakCLI Suite**) and toggle the switch to **ON**.
4. Press `Ctrl + R` (or `Cmd + R` on Mac) to reload [[obsidian|Obsidian]].

---

### Step 5: Verify in Settings
1. Open **Settings** (`Ctrl + ,`).
2. In the left sidebar, scroll down to the **[[community|Community]] [[plugin|plugin]] settings** section.
3. Click **PakCLI Suite**.
4. You will see the modular tab navigation bar on the left with all features ready for use!
