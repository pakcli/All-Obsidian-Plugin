---
title: "Codeblock Scaler"
---

# Feature: Codeblock Scaler (Codeblock Mode)

**Codeblock Scaler** gives you granular control over how large code blocks, [[ascii|ASCII]] diagrams, terminal outputs, and text tables render inside [[obsidian|Obsidian]] notes.

---

## 🔠 Key Modes

### 1. `scalefit` (Auto-Scale ASCII Diagrams)
Utilizes [[ascii diagram auto fit|ASCII diagram auto-fit (scalefit)]] to automatically calculate container width and scale wide [[ascii|ASCII]] art, box diagrams, or text tables to fit precisely within the note viewport without [[horizontal scrolling|horizontal scrollbars]] or ugly line wrapping.

### 2. `flowclip` / Scroll
Keeps fixed monospace dimensions and enables smooth [[horizontal scrolling|horizontal scrolling]] for wide terminal outputs or log files.

### 3. `wrap` (Soft Wrapping)
Utilizes [[word wrap|word wrap]] to automatically wrap long lines of code while maintaining proper indentation depth.

---

## 📝 Syntax Usage

Add the modifier tag directly in the codeblock [[markdown|Markdown]] language header:

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
- **Copy Button**: Toggle hover copy-to-[[clipboard|clipboard]] button on codeblocks.
