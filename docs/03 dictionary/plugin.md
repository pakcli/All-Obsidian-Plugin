---
title: "Plugin"
---



A **plugin** (or extension / add-on) is a modular software component that adds specific features, custom views, and capabilities to an existing host application like [[obsidian|Obsidian]].

---

## 🧩 How Plugins Work in Obsidian

- **Architecture**: Obsidian plugins are written in [[nodejs and typescript|TypeScript]] and JavaScript, executing directly within Obsidian's [[chromium|Chromium]]/[[electron|Electron]] [[runtime|runtime]] on your [[computer|computer]].
- **Release Files**: A standard Obsidian plugin consists of:
  - `main.js`: The bundled execution logic.
  - `manifest.json`: Metadata such as plugin ID, version, and description.
  - `styles.css`: Visual CSS styling.
- **PakCLI Suite**: A comprehensive power plugin bundling 10 high-impact modules (Codeblock Sync, SQLSeal, Tablite, Leaflet Maps, and more) into a single cohesive package.
