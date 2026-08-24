# Feature Brief: Inline & Immersive Full-Screen ASCII Drawing & Motion Studio (`asciidraw`)

## Overview
A lightweight, 100% local-first **ASCII Drawing & Animation Studio** for Obsidian. It provides an expressive, retro-aesthetic drawing and motion canvas that embeds directly into markdown notes (via ````asciidraw```` and ````asciimotion```` codeblocks) and can expand into an **immersive, edge-to-edge full-screen studio** for distraction-free tablet sketching.

---

## 🎯 Core Value Proposition vs. Excalidraw / Miro / OneNote

1. **Zero File Clutter (Single-File Architecture)**
   - Excalidraw creates separate `.excalidraw.md` or `.svg` files for every drawing, polluting the vault tree.
   - **`asciidraw` stores the complete drawing or animation directly inside the note's codeblock**. Moving or syncing the note keeps everything unified in one file.

2. **Tablet & Stylus-First Interaction**
   - High-precision touch & pen input with continuous Bresenham stroke interpolation (no gaps during fast handwriting or sketching).
   - Pressure-sensitive or smooth character trailing (`░`, `▒`, `▓`, `█`, `*`, `#`, `@`, Unicode boxes).

3. **Immersive Full-Screen Mode**
   - Dedicated full-screen studio view (`ItemView` or fullscreen modal overlay) designed specifically for tablets and desktop displays.
   - Auto-collapsible floating toolbars and maximized canvas area for distraction-free sketching.

4. **100% Greppable & Future-Proof Plaintext**
   - Diagram text and labels match native Obsidian global search and `ripgrep`.
   - Readable forever in Notepad, Vim, or GitHub without plugins.

---

## 🖥️ User Experience & Modes

### 1. In-Note Markdown Embed Mode (Reading & Live Preview)
- Renders crisp monospace art in note preview.
- Top micro-toolbar:
  - `[✏️ Edit / Draw]` → Launches the Drawing Studio.
  - `[⛶ Fullscreen]` → Opens the immersive full-screen canvas.
  - `[▶ Play / ⏸ Pause]` → Interactive animation playback (for multi-frame `asciimotion`).
  - `[📋 Copy]` → Copies plain ASCII text to clipboard.

### 2. Immersive Full-Screen Drawing Studio
- **Top Navigation**: Canvas dimensions (e.g. 40x15, 60x20, 80x24, 120x40, or custom), zoom (25% - 800%), grid toggle, theme selector, undo/redo, export, and `[💾 Save & Close]`.
- **Toolbox (Left)**:
  - ✏️ **Pencil / Freehand Brush**: Character stamping with continuous trail interpolation.
  - 🔲 **Box Tool**: Single Unicode `┌─┐│ │└─┘`, Double `╔═╗║ ║╚═╝`, ASCII `+-+| |+-+`, Filled `█`.
  - 📏 **Line & Arrow Tools**: Straight lines (`─`, `│`, `┼`) and directional arrows (`──►`, `<──`, `▲`, `▼`).
  - ⭕ **Circle / Ellipse Tool**: Midpoint circle algorithm for ASCII curves.
  - 🪣 **Flood Fill**: 4-way character & color bucket fill.
  - 🧼 **Eraser**: Clears cells to whitespace.
  - 🔤 **Text Tool**: Direct in-place monospace typing.
  - ✂️ **Selection & Marquee**: Move, copy, cut, paste regions.
  - 🔄 **Layer Transform (Affine Gizmo)**: Purple bounding box for translation, scaling, and rotation.
- **Palettes (Right)**:
  - Unicode Box Drawing & Connectors
  - Shading Blocks (`░`, `▒`, `▓`, `█`, `▀`, `▄`, `▌`, `▐`)
  - Minimal ASCII & Symbols
  - Cyberpunk, Matrix, Katakana & Braille
  - Color picker (Foreground & Cell Background)
- **Timeline / Motion Dock (Bottom)**:
  - Multi-frame timeline scrubber.
  - Onion skinning toggle (ghosted previous/next frames for animation).
  - FPS slider (1 - 30 fps), Loop toggle, Play / Step buttons.

---

## 💾 Storage & Data Format

### Plain ASCII Mode (Default for simple diagrams)
````markdown
```asciidraw
┌──────────────┐     ┌──────────────┐
│  Client App  │ ──► │  API Server  │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│ Local SQLite │     │ Postgres DB  │
└──────────────┘     └──────────────┘
```
````

### Rich Motion / Multi-Frame Mode
````markdown
```asciimotion
{
  "version": 1,
  "width": 60,
  "height": 20,
  "fps": 12,
  "theme": "matrix-green",
  "frames": [
    "┌───┐\n│ @ │\n└───┘",
    " ┌───┐\n │ @ │\n └───┘"
  ]
}
```
````

---

## 🚀 Commands & Ribbon

- **Ribbon Icon**: `[palette]` → "ASCII Studio: Open Fullscreen Canvas"
- **Command**: `ASCII Studio: Insert New Drawing at Cursor`
- **Command**: `ASCII Studio: Open Fullscreen Drawing Studio`
- **Command**: `ASCII Studio: Edit ASCII Block at Cursor`
