# Feature: Codeblock Scaler (Codeblock Mode)

**Codeblock Scaler** gives you granular control over how large code blocks, ASCII diagrams, terminal outputs, and text tables render inside Obsidian notes.

---

## 🔠 Key Modes

### 1. `scalefit` (Auto-Scale ASCII Diagrams)
Automatically calculates the container width and scales wide ASCII art, box diagrams, or text tables to fit precisely within the note viewport without horizontal scrollbars or ugly line wrapping.

### 2. `flowclip` / Scroll
Keeps fixed monospace dimensions and enables smooth horizontal scrollbars for wide terminal outputs or log files.

### 3. `wrap` (Soft Wrapping)
Automatically wraps long lines of code while maintaining proper indentation depth.

---

## 📝 Syntax Usage

Add the modifier tag directly in the codeblock language header:

````markdown
```text:scalefit
+-----------------------------------------------------------------------------------+
|  WIDE ASCII ARCHITECTURE DIAGRAM AUTO-FITTED TO THE NOTE CONTAINER VIEWPORT       |
+-----------------------------------------------------------------------------------+
```
````

---

## ⚙️ Configuration (Settings → PakCLI Suite → Codeblock Mode)

- **Default Codeblock Mode**: Set global default (`scalefit`, `flowclip`, or `wrap`).
- **Font Size Normalization**: Configure dynamic font-scaling boundaries.
- **Copy Button**: Toggle hover copy-to-clipboard button on codeblocks.
