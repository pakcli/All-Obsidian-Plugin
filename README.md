# PakCLI Suite

An all-in-one suite of powerful tools for Obsidian power users, integrating Leaflet Map Views, SQLSeal & Tablite CSV Editor, Symlink Manager, and Tree Diagram with Asset Router.

## Features

### 1. SQLSeal & Tablite CSV Editor
*   **Interactive Grid Editor:** Edit CSV/TSV files like spreadsheets using a built-in interactive table viewer and editor.
*   **SQLite Engine:** Execute complex SQL queries directly inside Obsidian notes using `wa-sqlite`.
*   **Dynamic Data Synchronization:** Keep your notes, metadata, and tables updated dynamically as underlying data files change.
*   **Syntax Highlighting:** Write SQL blocks with syntax-highlighted code.
*   **Receipt Scanner Integration:** Easily scan receipt files to populate tabular finances.

### 2. Bases Leaflet Map Views
*   **Interactive Maps:** Embed and view Leaflet maps directly inside Obsidian.
*   **Measure & Copy Tools:** Easily measure distances on maps or copy coordinates with a single click.
*   **Iconify Icon Sets:** Render custom map markers using Iconify icons.

### 3. Symlink Manager & Date Picker
*   **Symlinks & Junctions:** Create and manage symlinks/junctions between directories inside and outside the vault.
*   **Status Badges:** Color-coded status badges (green = junction, orange = symlink, red = broken link) directly in the file explorer.
*   **Fast Date Picker:** Quick Ctrl+D shortcut to insert customizable dates via modal.

### 4. Tree Diagram & Asset Router
*   **Tree Diagram Generator:** Generate visual hierarchy tree diagrams from indent-based or folder-based note sources.
*   **Dynamic Asset Router:** Automatically intercept newly pasted or created images/attachments and route them to designated centralized asset folders or nested captain folders.
*   **YAML Frontmatter Mapping:** Clean up link paths and match attachment filenames by note title properties automatically.

---

## Installation & Setup

### Dev (Watch Mode)
```bash
npm install --legacy-peer-deps
npm run dev
```

### Production Build
```bash
npm run build
```

### Deployment to Obsidian
1. Edit the `$VaultPath` variable at the top of the `build-and-copy.ps1` script to match your vault's plugins folder:
   ```powershell
   $VaultPath = "C:\Users\YourUsername\Documents\ObsidianVault\.obsidian\plugins\pakcli-editors-choice"
   ```
2. Run the deployment script in PowerShell:
   ```powershell
   ./build-and-copy.ps1
   ```
3. Open Obsidian, go to **Settings → Community plugins**, reload, and enable **PakCLI Editor's Choice**.
