---
title: "Docmost Sync"
---

# Feature: Docmost Sync

**Docmost Sync** enables two-way synchronization between your [[obsidian|Obsidian]] vault and a self-hosted **Docmost** team [[wiki|wiki]] knowledge base instance.

---

## 🔄 Key Capabilities

- **Two-Way Note Sync**: Perform [[push pull space notes|push & pull space notes]] operations to push local notes to Docmost spaces, or pull remote space documentation directly into your [[obsidian|Obsidian]] vault.
- **Space Management**: Organize notes by Docmost Space ID and map them to dedicated subfolders in your vault.
- **Media Preservation**: Preserves embedded images, codeblocks, and [[markdown|Markdown]] tables during synchronization.
- **Token-Based Authentication**: Securely connects via [[workspace token authentication|workspace token authentication]] API tokens with rate-limit handling and error recovery.

---

## 🛠️ Quick Commands

- `Docmost: Sync active note with remote`: Syncs the currently opened note.
- `Docmost: Push all notes to Space`: Uploads all notes in the mapped folder to Docmost using [[push pull space notes|push notes]].
- `Docmost: Pull Space notes`: Downloads and updates local notes from Docmost using [[push pull space notes|pull notes]].

---

## ⚙️ Configuration (Settings → PakCLI Suite → Docmost Sync)

- **Docmost Server URL**: Your Docmost instance endpoint (e.g. `https://docmost.example.com`).
- **API Token**: Personal access token configured via [[workspace token authentication|workspace token authentication]].
- **Default Space ID**: Target workspace space for syncing notes.
- **Vault Sync Directory**: Subfolder where pulled Docmost notes will be stored (e.g. `Wiki/Docmost`).
