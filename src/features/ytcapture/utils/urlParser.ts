/** YouTube URL parsing utilities */

export interface ParsedYouTubeUrl {
  videoId: string;
  startSeconds: number;
  originalUrl: string;
}

/**
 * Parse any YouTube URL format and extract video ID + timestamp.
 * Supports: youtu.be, youtube.com/watch, youtube.com/shorts, /embed/, /v/
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const raw = input.trim();
  let url: URL;

  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  let videoId = "";
  let startSeconds = 0;

  if (host === "youtu.be") {
    videoId = url.pathname.slice(1).split("/")[0] ?? "";
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/")[2] ?? "";
    } else if (
      url.pathname.startsWith("/embed/") ||
      url.pathname.startsWith("/v/")
    ) {
      videoId = url.pathname.split("/")[2] ?? "";
    } else {
      videoId = url.searchParams.get("v") ?? "";
    }
  }

  if (!videoId || videoId.length < 4) return null;

  // Timestamp: ?t=94 or ?t=94s or ?start=94
  const tParam = url.searchParams.get("t") ?? url.searchParams.get("start");
  if (tParam) {
    const numeric = tParam.replace(/[^0-9]/g, "");
    startSeconds = parseInt(numeric, 10) || 0;
  }

  return {
    videoId,
    startSeconds,
    originalUrl: raw.startsWith("http") ? raw : `https://${raw}`,
  };
}

/** Build a canonical watch URL with optional timestamp */
export function buildYouTubeUrl(videoId: string, startSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return startSeconds && startSeconds > 0 ? `${base}&t=${startSeconds}s` : base;
}

/** Convert seconds to HH:MM:SS or MM:SS */
export function secondsToTimestamp(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
