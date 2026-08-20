---
title: "YT Extension"
---

# Feature: YT Extension (YouTube Evidence Capture)

**YT Extension** is an evidence-capturing and video-note-taking module that allows you to extract high-resolution video frames, timestamped clips, and synchronized notes from YouTube videos directly into Obsidian.

---

## 🎥 Key Capabilities

- **1-Click High-Res Frame Capture**: Capture the exact video frame at the current timestamp and automatically save it as a local attachment in your vault.
- **Timestamped Note Insertion**: Generates deep-link timestamps (`04:12`) that open and seek the video to that exact second upon clicking.
- **Loop & Clip Playback**: Set In/Out loop ranges to repeatedly study complex video segments (tutorials, research, interviews).
- **Subtitle & Transcript Extraction**: Copy synchronized transcript segments directly into your active note.

---

## 🛠️ How to Open

1. Click the **film icon** (🎬) in the left Obsidian ribbon.
2. Or use the Command Palette (`Ctrl + P`): `YT Extension: Capture YouTube video clip`.

---

## ⚙️ Configuration (Settings → PakCLI Suite → YT Extension)

- **Attachment Save Path**: Set folder for captured frame images (e.g. `assets/yt_captures`).
- **Default Timestamp Format**: Choose between `[MM:SS]`, `[HH:MM:SS]`, or Markdown link style.
- **Auto-Paste Transcript**: Automatically paste copied subtitles alongside frame screenshots.
