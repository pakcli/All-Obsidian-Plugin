/**
 * Helper to parse yt-dlp stderr/stdout progress lines into ProgressInfo object.
 * Sample lines:
 * [download]  45.2% of  12.35MiB at  2.15MiB/s ETA 00:05
 * [download] 100% of 15.20MiB in 00:03
 */
import type { ProgressInfo } from "../types";

export function parseYtDlpProgress(line: string): ProgressInfo | null {
  const clean = line.trim();
  if (!clean.includes("[download]") && !clean.includes("%")) {
    return null;
  }

  // Matches: 45.2% of 12.35MiB at 2.15MiB/s ETA 00:05
  // or: 45.2% of ~12.35MiB at 2.15MiB/s ETA 00:05
  const percentMatch = clean.match(/([\d.]+)%/);
  if (!percentMatch) return null;

  const percent = parseFloat(percentMatch[1]);
  if (isNaN(percent)) return null;

  let total = "";
  const ofMatch = clean.match(/of\s+~?([\d.]+\s*\w+)/i);
  if (ofMatch) total = ofMatch[1];

  let speed = "";
  const speedMatch = clean.match(/at\s+([\d.]+\s*\w+\/s)/i);
  if (speedMatch) speed = speedMatch[1];

  let eta = "";
  const etaMatch = clean.match(/ETA\s+([\d:]+)/i);
  if (etaMatch) eta = etaMatch[1];

  return {
    percent: Math.min(100, Math.max(0, percent)),
    downloaded: "",
    total,
    speed,
    eta,
    rawMsg: clean,
  };
}
