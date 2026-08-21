---
title: "YT Extension"
---

# Feature: YT Extension (YouTube Evidence Capture)

**YT Extension** is an evidence-capturing and video-note-taking module that allows you to perform [[high resolution frame capture|high-resolution frame capture]], timestamped clips, and [[transcript sync|transcript sync]] from YouTube videos directly into [[obsidian|Obsidian]].

---

## 🎥 Key Capabilities

- **1-Click High-Res Frame Capture**: Perform [[high resolution frame capture|high-resolution frame capture]] to extract the exact video frame at the current timestamp and automatically save it as a local attachment in your vault.
- **Timestamped Note Insertion**: Generates deep-link timestamps (`04:12`) that open and seek the video to that exact second upon clicking.
- **Loop & Clip Playback**: Utilize [[video segment looping|video segment looping]] to set In/Out loop ranges to repeatedly study complex video segments (tutorials, research, interviews).
- **Subtitle & Transcript Extraction**: Perform [[transcript sync|transcript sync]] to copy synchronized [[transcript|transcript]] segments directly into your active note.

---

## 🛠️ How to Open

1. Click the **film icon** (🎬) in the left [[obsidian|Obsidian]] ribbon.
2. Or use the Command Palette (`Ctrl + P`): `YT Extension: Capture YouTube video clip`.

---

## ⚙️ Configuration (Settings → PakCLI Suite → YT Extension)

- **Attachment Save Path**: Set folder for captured frame images (e.g. `assets/yt_captures`).
- **Default Timestamp Format**: Choose between `[MM:SS]`, `[HH:MM:SS]`, or [[wiki|Markdown link style]].
- **Auto-Paste Transcript**: Automatically paste copied subtitles alongside frame screenshots via [[transcript sync|transcript sync]].
