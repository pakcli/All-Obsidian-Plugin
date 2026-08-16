# Feature: Codeblock Sync (Two-Way Script Sync)

**Codeblock Sync** connects the script codeblocks inside your [[markdown|Markdown]] notes (`.md`) with standalone script files on your [[computer|computer]]'s disk (e.g. [[powershell|PowerShell]] `.ps1`, Python `.py`, Node.js `.js`, Bash `.sh`, Command Prompt `.cmd`).

It turns your [[obsidian|Obsidian]] notes into interactive executable dashboards with real-time change detection, visual diff comparisons, and instant subfolder mirroring.

---

## 🧱 The Two-Section Codeblock Layout

When any script codeblock (`powershell`, `python`, `bash`, `cmd`, `javascript`, etc.) renders in your note, it presents a 2-section interactive widget:

```
+-----------------------------------------------------------------------------------+
|                        TWO-SECTION SCRIPT CODEBLOCK                               |
+-----------------------------------------------------------------------------------+
| [ SECTION 1: SCRIPT SYNC & DIFF CONTROLLER ]                                     |
|   📁 ALL SCRIPT/Admin/Backup.ps1        |  Status: ⚡ Note Modified               |
|   [⚡ Sync to Script]  [👁️ Diff]  [✕ Ignore]  [⏰ Remind Later]  [▶ Run]           |
|   -----------------------------------------------------------------------------   |
|   (Expandable Line-by-Line Diff: green added / red removed)                       |
|   (Expandable Execution Console: live stdout / stderr output)                     |
+-----------------------------------------------------------------------------------+
| [ SECTION 2: FORMATTED CODEBLOCK VIEW ]                                           |
|   POWERSHELL                                                          [📋 Copy]   |
|   Write-Host "Executing database backup..."                                       |
+-----------------------------------------------------------------------------------+
```

---

## ⚡ Key Capabilities

### 1. Special Markdown Extraction Rule
- **Manager Note ➔ Disk Script**: The engine extracts **only the first fenced codeblock** in the [[markdown|Markdown]] note. All titles, headers, comments, and extra notes outside the first block are preserved.
- **Disk Script ➔ Manager Note**: Reverse-sync replaces only the first code block, leaving all surrounding notes and descriptions 100% intact.

### 2. Automatic Subfolder Mirroring
- If your note lives in a nested subfolder (e.g. `Digital Library/CLI & Commands/Git/Checkout.md`), Codeblock Sync will automatically mirror that exact subfolder hierarchy on your [[computer|computer]]'s target scripts folder (`ALL SCRIPT/Git/Checkout.sh`).

### 3. Interactive Actions:
- **`⚡ Sync to Script`**: Writes the code in the note directly to the disk script file on your [[computer|computer]].
- **`📥 Pull from Script`**: Injects external changes from disk back into the note.
- **`👁️ Diff`**: Expands an inline line-by-line visual comparison with green added and red deleted highlights.
- **`✕ Ignore`**: Ignores the difference for the current session.
- **`⏰ Remind Later`**: Defers the change to the **Pending Sync Queue**.
- **`▶ Run`**: Executes the script directly (via [[powershell|PowerShell]], Node.js, Python, or Bash) and displays the terminal output in an expandable drawer.

### 4. Interactive Scan & Sync Dashboard
- Click the **`terminal` icon** on the left [[obsidian|Obsidian]] ribbon (or run `Codeblock Sync: Scan Vault Notes & Open Dashboard`).
- Features a **`Hide Synced`** checkbox filter to focus only on notes with unsaved changes.
- Click **`⚡ Sync Changed`** for a 1-click batch sync of all notes.

---

## ⚙️ Configuration (Settings → PakCLI Suite → Codeblock Sync)

- **Script Target Folder**: Subfolder in your vault where script files live (e.g. `ALL SCRIPT`, `scripts`, or `ALL POWERSHELL`). Click **`📁 Browse...`** to pick directly.
- **Notes Source Folder**: Subfolder where script notes are stored (e.g. `Digital Library/CLI & Commands` or leave blank for the entire vault).
- **Auto-Watch Script Directory**: Automatically detects external file edits on your [[computer|computer]]'s disk.
