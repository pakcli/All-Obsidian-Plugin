---
title: "Date Picker"
---

# Feature: Date Picker

**Date Picker** provides a fast, keyboard-friendly date selector and natural language timestamp inserter inside [[obsidian|Obsidian]].

---

## 📅 Key Capabilities

- **Interactive Calendar Modal**: Open a visual [[calendar popup|calendar popup]] to pick any date with one click.
- **Natural Language Parsing**: Type terms like `today`, `tomorrow`, `next friday`, or `+3d` via [[shortcut triggers|shortcut triggers]] to automatically resolve the date.
- **Custom Format Presets**: Output dates in standard [[format presets|format presets]] such as `YYYY-MM-DD`, `DD/MM/YYYY`, or timestamped formats (`YYYY-MM-DD HH:mm`).
- **Wikilink Daily Notes Integration**: Optionally wrap inserted dates as [[obsidian|daily note]] [[wiki|wikilinks]] (`[[2026-08-20]]`).

---

## ⌨️ Shortcuts & Commands

- Open Command Palette (`Ctrl + P`): `Date Picker: Insert current date` or `Date Picker: Open calendar popup`.
- Custom hotkeys and [[shortcut triggers|shortcut triggers]] can be bound via **Settings → Hotkeys**.

---

## ⚙️ Configuration (Settings → PakCLI Suite → Date Picker)

- **Default Date Format**: Set your preferred [[format presets|format preset]] (e.g. `YYYY-MM-DD`).
- **Wrap with Wikilinks**: Automatically wrap inserted dates with [[wiki|wikilinks]] (`[[...]]`).
- **Include Timestamp**: Append current local time (`HH:mm:ss`).
