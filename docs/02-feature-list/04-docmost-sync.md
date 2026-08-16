# Feature: Docmost Sync

**Docmost Sync** enables two-way synchronization between your Obsidian vault and a self-hosted **Docmost** team wiki/knowledge base instance.

---

## 🔄 Key Capabilities

- **Two-Way Note Sync**: Push local notes to Docmost spaces, or pull remote space documentation directly into your Obsidian vault.
- **Space Management**: Organize notes by Docmost Space ID and map them to dedicated subfolders in your vault.
- **Media Preservation**: Preserves embedded images, codeblocks, and markdown tables during synchronization.
- **Token-Based Authentication**: Securely connects via API token with rate-limit handling and error recovery.

---

## 🛠️ Quick Commands

- `Docmost: Sync active note with remote`: Syncs the currently opened note.
- `Docmost: Push all notes to Space`: Uploads all notes in the mapped folder to Docmost.
- `Docmost: Pull Space notes`: Downloads and updates local notes from Docmost.

---

## ⚙️ Configuration (Settings → PakCLI Suite → Docmost Sync)

- **Docmost Server URL**: Your Docmost instance endpoint (e.g. `https://docmost.example.com`).
- **API Token**: Personal access token generated from your Docmost user profile.
- **Default Space ID**: Target workspace space for syncing notes.
- **Vault Sync Directory**: Subfolder where pulled Docmost notes will be stored (e.g. `Wiki/Docmost`).
