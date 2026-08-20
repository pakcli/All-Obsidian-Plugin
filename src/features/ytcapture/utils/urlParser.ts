/** YouTube & Instagram URL parsing utilities */

export type PlatformType = "youtube" | "instagram";

export interface ParsedMediaUrl {
  platform: PlatformType;
  videoId: string;
  startSeconds: number;
  originalUrl: string;
}

export type ParsedYouTubeUrl = ParsedMediaUrl;

/**
 * Parse YouTube or Instagram URL format and extract video/post ID + platform + timestamp.
 * Supports YouTube: youtu.be, youtube.com/watch, youtube.com/shorts, /embed/, /v/
 * Supports Instagram: instagram.com/p/, instagram.com/reel/, instagram.com/reels/, instagram.com/tv/, instagr.am
 */
export function parseMediaUrl(input: string): ParsedMediaUrl | null {
  const raw = input.trim();
  let url: URL;

  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  let platform: PlatformType = "youtube";
  let videoId = "";
  let startSeconds = 0;

  if (host === "youtu.be") {
    platform = "youtube";
    videoId = url.pathname.slice(1).split("/")[0] ?? "";
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    platform = "youtube";
    if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/")[2] ?? "";
    } else if (url.pathname.startsWith("/live/")) {
      videoId = url.pathname.split("/")[2] ?? "";
    } else if (
      url.pathname.startsWith("/embed/") ||
      url.pathname.startsWith("/v/")
    ) {
      videoId = url.pathname.split("/")[2] ?? "";
    } else {
      videoId = url.searchParams.get("v") ?? "";
    }
  } else if (
    host === "instagram.com" ||
    host === "m.instagram.com" ||
    host === "instagr.am"
  ) {
    platform = "instagram";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["reel", "reels", "p", "tv"].includes(parts[0])) {
      videoId = parts[1];
    } else if (parts.length >= 1 && parts[0].length > 3) {
      videoId = parts[0];
    }
  }

  if (!videoId || videoId.length < 3) return null;

  // Timestamp: ?t=4731 or ?t=1h18m51s or ?t=94s or ?start=94
  const tParam = url.searchParams.get("t") ?? url.searchParams.get("start");
  if (tParam) {
    const hmsMatch = tParam.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
    if (
      hmsMatch &&
      (hmsMatch[1] ||
        hmsMatch[2] ||
        (hmsMatch[3] &&
          (tParam.includes("h") || tParam.includes("m") || tParam.includes("s"))))
    ) {
      const hours = parseInt(hmsMatch[1] || "0", 10);
      const minutes = parseInt(hmsMatch[2] || "0", 10);
      const seconds = parseInt(hmsMatch[3] || "0", 10);
      startSeconds = hours * 3600 + minutes * 60 + seconds;
    } else {
      const numeric = parseInt(tParam.replace(/[^0-9]/g, ""), 10);
      startSeconds = isNaN(numeric) ? 0 : numeric;
    }
  }

  return {
    platform,
    videoId,
    startSeconds,
    originalUrl: raw.startsWith("http") ? raw : `https://${raw}`,
  };
}

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  return parseMediaUrl(input);
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

