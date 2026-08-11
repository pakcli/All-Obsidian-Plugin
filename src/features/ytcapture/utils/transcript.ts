/** Subtitle / transcript utilities */
import type { TranscriptEntry } from "../types";

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

interface Json3Root {
  events?: Json3Event[];
}

/** Parse a json3 subtitle object (already JSON.parsed) */
export function parseSubtitleFile(raw: Json3Root): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const event of raw.events ?? []) {
    const text = (event.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    entries.push({
      startMs: event.tStartMs ?? 0,
      endMs: (event.tStartMs ?? 0) + (event.dDurationMs ?? 0),
      text,
    });
  }
  return entries;
}

export function extractClipTranscript(
  entries: TranscriptEntry[],
  startSec: number,
  endSec: number
): TranscriptEntry[] {
  const startMs = startSec * 1000;
  const endMs = endSec * 1000;
  return entries.filter((e) => e.endMs >= startMs && e.startMs <= endMs);
}

function msToTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format transcript entries as markdown lines.
 *  @param full  If true, includes full timestamps; if false omits sub-second detail */
export function formatTranscriptForMarkdown(
  entries: TranscriptEntry[],
  _full: boolean
): string {
  return entries
    .map((e) => `[${msToTimestamp(e.startMs)}] ${e.text}`)
    .join("\n");
}
