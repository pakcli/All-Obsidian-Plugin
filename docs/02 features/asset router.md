---
title: "Asset Router & Tree Diagrams"
---

# Feature: Asset Router & Tree Diagrams

**Asset Router** manages where newly pasted or dragged attachments (images, PDFs, audio, archives) are stored in your vault, and generates visual ASCII / SVG **Tree Structure Diagrams**.

---

## 📁 Key Capabilities

### 1. Centralized & Rule-Based Asset Routing
- Automatically route pasted images to a dedicated folder (e.g. `assets/` or `attachments/`).
- Define custom folder rules based on file extension (e.g. all `.pdf` files go to `documents/`, while `.png`/`.jpg` go to `images/`).
- Support for subfolder mirroring and active-note-adjacent asset folders (`./assets`).

### 2. Interactive File Tree Diagram Generator
- Generate visual ASCII / Mermaid / SVG tree diagrams of any directory structure in your vault:

```text
├── Digital Library/
│   ├── CLI & Commands/
│   │   ├── Command Prompt/
│   │   ├── Gitbash/
│   │   └── Powershell/
│   └── Research/
└── ALL SCRIPT/
```

---

## ⚙️ Configuration (Settings → PakCLI Suite → Asset Router)

- **Enable Centralized Routing**: Toggle global asset routing on or off.
- **Global Attachment Folder**: The target folder for general attachments.
- **Folder Rule Engine**: Add custom routing paths based on specific folder origins or file formats.
