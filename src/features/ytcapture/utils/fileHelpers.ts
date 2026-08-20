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

/**
 * Format timestamp into dd-hh-mm-ss-ss (day-jam-minute-second-frame)
 */
export function formatDetailedTimestamp(seconds: number): string {
  const total = Math.max(0, seconds || 0);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * 100);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}-${pad(h)}-${pad(m)}-${pad(s)}-${pad(f)}`;
}

/**
 * Build structured filename base following pattern:
 * titlevid_[timestamp start and end]_[format]_[resolution]
 */
export function buildMediaBaseName(
  title: string,
  startSec: number,
  endSec: number,
  quality: string
): { baseName: string; formatExt: "mp4" | "mp3"; resolution: string } {
  const safeTitle = sanitizeFilename(title);
  const startStr = formatDetailedTimestamp(startSec);
  const endStr = formatDetailedTimestamp(endSec);
  const formatExt = quality === "audio" ? "mp3" : "mp4";
  const resolution = quality || "1080p";

  const timeStampStr = `${startStr}_to_${endStr}`;
  const baseName = `${safeTitle}_${timeStampStr}_${formatExt}_${resolution}`;

  return { baseName, formatExt, resolution };
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
  mediaEmbeds?: {
    mp4Filename: string;
    thumbFilename: string;
  };
  frontmatterKeys?: {
    titleKey?: string;
    urlKey?: string;
    channelKey?: string;
    uploadDateKey?: string;
    thumbnailKey?: string;
    timeRangeKey?: string;
    descriptionKey?: string;
  };
}

export function buildNotesMarkdown(p: NoteParams): string {
  const mp4Name = p.mediaEmbeds?.mp4Filename || "clip.mp4";
  const thumbName = p.mediaEmbeds?.thumbFilename || "thumb.jpg";
  const keys = p.frontmatterKeys || {};

  const titleK = keys.titleKey || "yt_title";
  const urlK = keys.urlKey || "yt_url";
  const channelK = keys.channelKey || "yt_channel";
  const uploadK = keys.uploadDateKey || "yt_upload_date";
  const thumbK = keys.thumbnailKey || "yt_thumbnail";
  const timeRangeK = keys.timeRangeKey || "capture_time_range";
  const descK = keys.descriptionKey || "yt_description";

  const timeRangeVal = `${formatTime(p.clipStart)}–${formatTime(p.clipEnd)}`;
  const cleanDesc = (p.description || "").replace(/"/g, '\\"').replace(/\r?\n/g, " ");

  const frontmatter = [
    "---",
    `${titleK}: "${p.title.replace(/"/g, '\\"')}"`,
    `${urlK}: "${p.url}"`,
    `${channelK}: "${p.channel}"`,
    `${uploadK}: "${p.uploadDate}"`,
    `${thumbK}: "${thumbName}"`,
    `${timeRangeK}: "${timeRangeVal}"`,
    `${descK}: "${cleanDesc}"`,
    `video_id: "${p.videoId}"`,
    `captured_at: "${p.capturedAt}"`,
    `clip_duration_seconds: ${p.clipDuration}`,
    `view_count: ${p.viewCount}`,
    `tags: [${p.tags.map((t) => `"${t}"`).join(", ")}]`,
    `clip_file: "${mp4Name}"`,
    "---",
  ].join("\n");

  const embeds = p.mediaEmbeds
    ? [
        `![[${mp4Name}]]`,
        "",
        `![[${thumbName}]]`,
        "",
      ]
    : [];

  return [
    frontmatter,
    "",
    `# ${p.title}`,
    "",
    ...embeds,
    `## Clip transcript (${timeRangeVal})`,
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
