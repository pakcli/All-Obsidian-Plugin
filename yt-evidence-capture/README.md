# YT Evidence Capture

**Obsidian community plugin** — Paste a YouTube link, click Capture, get a `.zip` containing a video clip, thumbnail, and `notes.md` with full transcript and YAML metadata.

## Use case

Quickly archive "evidence" from a YouTube video — clip the exact moment, preserve the transcript, and bundle everything before the video is edited or deleted.

## Prerequisites

Both tools must be installed and accessible on your system PATH (or configured via plugin settings):

| Tool | Install |
|------|---------|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) | `winget install yt-dlp` / `brew install yt-dlp` / `pip install yt-dlp` |
| [ffmpeg](https://ffmpeg.org/download.html) | `winget install ffmpeg` / `brew install ffmpeg` |

## What's in the zip

```
capture.zip
├── clip.mp4        # Trimmed video clip (default 10 s, configurable)
├── thumb.jpg       # Video thumbnail
└── notes.md        # YAML frontmatter + transcript + description
```

### notes.md frontmatter
```yaml
---
title: "Video title"
url: "https://youtube.com/watch?v=...&t=94s"
video_id: "..."
channel: "Channel Name"
upload_date: "20260811"
captured_at: "2026-08-11T05:00:00Z"
clip_start: "01:34"
clip_end:   "01:44"
clip_duration_seconds: 10
view_count: 12345
tags: ["tag1", "tag2"]
clip_file: "clip.mp4"
thumbnail_file: "thumb.jpg"
---
```

## Usage

1. Click the 🎬 ribbon icon **or** run `YT Evidence Capture: Capture YouTube evidence clip` from the command palette.
2. Paste a YouTube URL (with `?t=` timestamp if needed) and set clip duration.
3. Click **Fetch Preview** — review the video title, thumbnail, and clip range.
4. Optionally edit the duration in the preview step.
5. Click **Capture** — the plugin downloads, trims, and packages everything.
6. Find the `.zip` in your configured output folder (default: `YT Captures/`).

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| yt-dlp path | `yt-dlp` | Binary path or name if on PATH |
| ffmpeg path | `ffmpeg` | Binary path or name if on PATH |
| Output folder | `YT Captures` | Vault folder for zip files |
| Default duration | `10` | Clip length in seconds |

## Manual install (development)

```bash
cd path/to/vault/.obsidian/plugins/
git clone <repo> yt-evidence-capture
cd yt-evidence-capture
npm install
npm run build
```

Then enable the plugin in **Settings → Community plugins**.

## Notes

- Requires `isDesktopOnly: true` — does not run on mobile (needs yt-dlp + ffmpeg).
- Transcripts use yt-dlp's subtitle download (manual + auto-generated). Videos without any captions will still produce a complete zip, with a note in the transcript section.
- Large clips (60+ s) will take longer to download — progress is shown in the processing log.
