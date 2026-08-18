# Feature Brief: Draggable Attachments with On-the-Fly Image Compressor & Native Explorer Bridge

## 🎯 Executive Summary
Enhance Obsidian's file explorer and note attachments with **native OS-level drag-and-drop**, **system clipboard bridge (Cut/Copy/Paste)**, and an **on-the-fly smart image compressor (PNG/JPG/WebP)** so users can drag lightweight, optimized media directly into web dropzones (Google Drive, Dropbox, Gmail), AI chats (ChatGPT, Claude), and desktop apps.

file compress img png/jpg  on selected nest captain

from img attacment line hold ada to compress , 

so it can dragn dropto loike dropable area like google upload and dropbox etc


---

## 🧱 Key Capabilities

### 1. 🗜️ On-the-Fly Image Compressor (PNG / JPG / WebP)
- **Zero-Friction Drag Compression**:
  - Automatically compress heavy images (e.g. 10MB camera/screenshot files) down to lightweight web-friendly sizes (e.g. < 500KB) when dragging into external web dropzones (Google Drive, Dropbox, Discord, ChatGPT).
- **Hold Key / Toggle Mode**:
  - Hold `Alt` (or `Shift`) while dragging to instantly generate and drop a compressed version.
- **In-Vault Compression & Actions**:
  - Right-click any image in a note or file tree:
    - `🗜️ Compress & Copy to Clipboard` (instant compressed paste into Claude/ChatGPT).
    - `🗜️ Compress Image in Place` (replaces large raw image with an optimized version in the vault).
- **Customizable Compression Engine (HTML5 Canvas + Sharp/Electron Native)**:
  - Quality Slider (e.g. 50% - 90%, Default: 80%).
  - Max Width/Height constraint (e.g. 1920px, 1280px, or Original).
  - Target format: WebP (best compression), JPEG, or optimized PNG.

---

### 2. 🗂️ Native Hierarchy Explorer Drag-Out & Multi-Vault Bridge
- **Drag Out of Sidebar Tree**:
  - Drag notes (`.md`), folders, scripts, PDFs, and media directly from Obsidian's sidebar tree to:
    - Windows Explorer / Desktop (creates real files on disk).
    - Another Obsidian Vault window (instantly imports files).
    - External applications (VS Code, Slack, Telegram, Figma).
- **Multi-File Selection Dragging**:
  - Drag multiple selected files/folders in the tree as a batch OS file payload.

---

### 3. ✂️ Native OS Clipboard Shortcuts (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`)
- **`Ctrl + C` (Copy to OS Clipboard)**:
  - Select file/folder in the tree ➔ press `Ctrl+C` ➔ press `Ctrl+V` in Windows Explorer or Desktop.
- **`Ctrl + X` (Cut / Move)**:
  - Cut file from Obsidian ➔ paste into another folder or external file manager to move.
- **`Ctrl + V` (Paste from OS Clipboard into Tree)**:
  - Copy any screenshot, image, or file from your browser/desktop ➔ click any folder in Obsidian's tree ➔ press `Ctrl+V` to immediately import it into that folder.

---

### 4. 🖱️ Context Menu Enhancements
Right-clicking any file, folder, or embedded image:
- `📋 Copy Native File (OS Clipboard)`
- `✂️ Cut Native File (OS Move)`
- `📥 Paste Files into this Folder`
- `🗜️ Compress & Copy Image (Web-optimized)`
- `📂 Reveal in System File Explorer`

---

## ⚙️ Settings Configuration (Settings → PakCLI Suite → Asset Draggable & Explorer)

| Setting Name | Default | Description |
| :--- | :--- | :--- |
| **Enable Explorer Drag-Out** | `true` | Allow dragging files/folders out of the sidebar tree to OS dropzones |
| **Enable OS Cut/Copy/Paste** | `true` | Enable `Ctrl+C` / `Ctrl+X` / `Ctrl+V` on the file explorer tree |
| **Enable On-The-Fly Compression** | `true` | Compress images on drag-out when holding `Alt` or by default |
| **Image Compression Quality** | `80%` | JPEG/WebP quality (0 - 100%) |
| **Max Image Dimensions** | `1920px` | Maximum width/height scaling for compressed drag exports |
| **Compressed Drag Format** | `WebP / JPEG` | Target compression format |
