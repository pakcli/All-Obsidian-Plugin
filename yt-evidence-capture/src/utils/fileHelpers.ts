/**
 * File system helpers: filename sanitization, time formatting,
 * and notes.md content builder.
 */

// ─── Filename sanitization ────────────────────────────────────────────────────

/**
 * Sanitize a video title into a safe cross-platform filename segment.
 * Strips illegal chars, collapses whitespace, limits length.
 */
export function sanitizeFilename(name: string): string {
  return (
    name
      // Remove filesystem-illegal characters (Windows + Unix superset)
      .replace(new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f]', 'g'), "_")
      // Collapse runs of whitespace/underscores
      .replace(/[\s_]+/g, "_")
      // Strip leading dots/underscores
      .replace(/^[._]+/, "")
      // Max 100 chars
      .substring(0, 100)
      .trim() || "capture"
  );
}

// ─── Time formatting ──────────────────────────────────────────────────────────

/**
 * Format seconds into MM:SS (or H:MM:SS if ≥ 1 hour).
 */
export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── notes.md builder ────────────────────────────────────────────────────────

export interface NotesParams {
  title: string;
  url: string;
  videoId: string;
  channel: string;
  channelUrl: string;
  uploadDate: string;
  videoDuration: number;
  capturedAt: string;
  clipStart: number;
  clipEnd: number;
  clipDuration: number;
  viewCount: number;
  tags: string[];
  clipTranscript: string;
  description: string;
  fullTranscript: string;
}

/**
 * Build the full notes.md content with YAML frontmatter.
 */
export function buildNotesMarkdown(p: NotesParams): string {
  const startFmt = formatTime(p.clipStart);
  const endFmt = formatTime(p.clipEnd);

  // Escape double-quotes in YAML string values
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // Build YAML tags array
  const tagsYaml =
    p.tags && p.tags.length > 0
      ? `[${p.tags.map((t) => `"${esc(t)}"`).join(", ")}]`
      : "[]";

  return `---
title: "${esc(p.title)}"
url: "${p.url}"
video_id: "${p.videoId}"
channel: "${esc(p.channel)}"
channel_url: "${p.channelUrl}"
upload_date: "${p.uploadDate}"
video_duration_seconds: ${p.videoDuration}
captured_at: "${p.capturedAt}"
clip_start: "${startFmt}"
clip_end: "${endFmt}"
clip_duration_seconds: ${p.clipDuration}
view_count: ${p.viewCount || 0}
tags: ${tagsYaml}
clip_file: "clip.mp4"
thumbnail_file: "thumb.jpg"
---

# ${p.title}

**Source:** ${p.url}
**Channel:** ${p.channel}
**Captured:** ${p.capturedAt}
**Clip range:** ${startFmt} – ${endFmt}

![thumbnail](thumb.jpg)

## Clip transcript (${startFmt}–${endFmt})

${p.clipTranscript}

## Description

${p.description || "_No description available._"}

## Full transcript

${p.fullTranscript}
`;
}
