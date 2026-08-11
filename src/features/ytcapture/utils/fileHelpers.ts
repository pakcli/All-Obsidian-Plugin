/** File helper utilities */

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export function formatTime(seconds: number | undefined): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface NoteParams {
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

export function buildNotesMarkdown(p: NoteParams): string {
  const frontmatter = [
    "---",
    `title: "${p.title.replace(/"/g, '\\"')}"`,
    `url: "${p.url}"`,
    `video_id: "${p.videoId}"`,
    `channel: "${p.channel}"`,
    `upload_date: "${p.uploadDate}"`,
    `captured_at: "${p.capturedAt}"`,
    `clip_start: "${formatTime(p.clipStart)}"`,
    `clip_end: "${formatTime(p.clipEnd)}"`,
    `clip_duration_seconds: ${p.clipDuration}`,
    `view_count: ${p.viewCount}`,
    `tags: [${p.tags.map((t) => `"${t}"`).join(", ")}]`,
    `clip_file: "clip.mp4"`,
    `thumbnail_file: "thumb.jpg"`,
    "---",
  ].join("\n");

  return [
    frontmatter,
    "",
    `# ${p.title}`,
    "",
    `## Clip transcript (${formatTime(p.clipStart)}–${formatTime(p.clipEnd)})`,
    "",
    p.clipTranscript,
    "",
    "## Description",
    "",
    p.description || "*No description.*",
    "",
    "## Full transcript",
    "",
    p.fullTranscript,
  ].join("\n");
}
