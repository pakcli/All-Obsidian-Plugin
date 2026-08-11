/**
 * Transcript parsing utilities.
 * Parses yt-dlp json3 subtitle format and provides
 * clip-range extraction and markdown formatting.
 */
import type { TranscriptEntry } from "../types";

// ─── Parse ────────────────────────────────────────────────────────────────────

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
}

/**
 * Parse a yt-dlp json3 subtitle file into transcript entries.
 */
export function parseSubtitleFile(json3: { events?: Json3Event[] }): TranscriptEntry[] {
  return (json3.events ?? [])
    .filter((e) => e.segs && e.tStartMs !== undefined)
    .map((e) => ({
      start: (e.tStartMs ?? 0) / 1000,
      duration: (e.dDurationMs ?? 2000) / 1000,
      text: (e.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim(),
    }))
    .filter((e) => e.text.length > 0);
}

// ─── Extract clip range ───────────────────────────────────────────────────────

/**
 * Filter transcript entries that overlap with [start, end] in seconds.
 */
export function extractClipTranscript(
  entries: TranscriptEntry[],
  start: number,
  end: number
): TranscriptEntry[] {
  return entries.filter(
    (e) => e.start < end && e.start + e.duration > start
  );
}

// ─── Format for markdown ──────────────────────────────────────────────────────

/**
 * Format entries as a markdown block.
 * @param timestamped - If true, prefix each line with [MM:SS] timestamp.
 */
export function formatTranscriptForMarkdown(
  entries: TranscriptEntry[],
  timestamped = true
): string {
  if (entries.length === 0) return "_No transcript available._";

  return entries
    .map((e) => {
      if (!timestamped) return e.text;
      const mins = Math.floor(e.start / 60).toString().padStart(2, "0");
      const secs = Math.floor(e.start % 60).toString().padStart(2, "0");
      return `[${mins}:${secs}] ${e.text}`;
    })
    .join("\n");
}
