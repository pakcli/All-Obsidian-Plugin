# Feature: Asset Draggable (AI Drag & Drop Bridge)

**Asset Draggable** allows you to seamlessly drag and drop local images and attachments from Obsidian directly into external browser applications (such as ChatGPT, Claude, Discord, and Slack) without opening File Explorer.

---

## 🖱️ Key Capabilities

- **Native Drag Out of Obsidian**: Click and drag any embedded image from your Obsidian note directly into your browser tab or desktop application.
- **Copy Image Data to Clipboard**: Right-click any embedded image and select **Copy Image (Binary)** to paste directly into AI chatbots without saving to disk first.
- **File Path Resolution**: Automatically resolves vault-relative paths (`![[attachments/photo.png]]`) to absolute local filesystem paths.

---

## 🚀 How to Use

1. Place your cursor or mouse over any embedded image in Reading or Live Preview mode.
2. Drag the image directly into your browser window (e.g. ChatGPT input box).
3. The image is instantly attached and ready to prompt!

---

## ⚙️ Configuration (Settings → PakCLI Suite → Asset Draggable)

- **Enable Drag-Out Helper**: Toggle native dragging bridge on or off.
- **Right-Click Context Menu Options**: Enable **Copy Absolute Path** and **Copy Image Binary** in note context menus.
