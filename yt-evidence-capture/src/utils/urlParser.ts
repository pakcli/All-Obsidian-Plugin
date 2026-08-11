/** Parses a YouTube URL and extracts the video ID and start timestamp in seconds. */
export interface ParsedYouTubeUrl {
  videoId: string;
  startSeconds: number;
}

/**
 * Supports:
 *   youtube.com/watch?v=ID&t=94s
 *   youtube.com/watch?v=ID&t=1m34s
 *   youtu.be/ID?t=94
 *   youtube.com/shorts/ID
 *   youtube.com/embed/ID
 *   youtube.com/live/ID
 */
export function parseYouTubeUrl(rawUrl: string): ParsedYouTubeUrl | null {
  let url = rawUrl.trim();
  if (!url.startsWith("http")) url = "https://" + url;

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    let videoId: string | null = null;

    if (host === "youtube.com") {
      if (u.pathname === "/watch") {
        videoId = u.searchParams.get("v");
      } else if (u.pathname.startsWith("/shorts/")) {
        videoId = u.pathname.split("/shorts/")[1]?.split(/[/?]/)[0] ?? null;
      } else if (u.pathname.startsWith("/embed/")) {
        videoId = u.pathname.split("/embed/")[1]?.split(/[/?]/)[0] ?? null;
      } else if (u.pathname.startsWith("/live/")) {
        videoId = u.pathname.split("/live/")[1]?.split(/[/?]/)[0] ?? null;
      }
    } else if (host === "youtu.be") {
      videoId = u.pathname.slice(1).split(/[/?]/)[0] ?? null;
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

    const t = u.searchParams.get("t");
    const startSeconds = t ? parseTimestamp(t) : 0;

    return { videoId, startSeconds };
  } catch {
    return null;
  }
}

/** Parses t= param: "94", "94s", "1m34s", "1h30m45s" */
function parseTimestamp(t: string): number {
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  let total = 0;
  const h = t.match(/(\d+)h/);
  const m = t.match(/(\d+)m/);
  const s = t.match(/(\d+)s/);
  if (h) total += parseInt(h[1]) * 3600;
  if (m) total += parseInt(m[1]) * 60;
  if (s) total += parseInt(s[1]);
  return total;
}

/** Builds a canonical YouTube watch URL, optionally with timestamp. */
export function buildYouTubeUrl(videoId: string, startSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return startSeconds && startSeconds > 0 ? `${base}&t=${startSeconds}s` : base;
}
