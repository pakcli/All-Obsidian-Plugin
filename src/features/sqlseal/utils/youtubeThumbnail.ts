import { App, requestUrl, Notice, TFile } from "obsidian";

export const YT_THUMBNAIL_CACHE_DIR = "assets/yt_thumbnails";

/**
 * Extracts the 11-character YouTube video ID from various YouTube URL formats.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const str = url.trim();
  const match = str.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

/**
 * Gets the local resource URL for a cached thumbnail, or downloads it on demand.
 */
export async function getOrDownloadYtThumbnail(
  app: App,
  videoId: string,
): Promise<string | null> {
  if (!videoId) return null;
  const targetPath = `${YT_THUMBNAIL_CACHE_DIR}/${videoId}.jpg`;

  try {
    const existing = app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      return app.vault.getResourcePath(existing);
    }

    // Ensure cache folder exists
    const parts = YT_THUMBNAIL_CACHE_DIR.split("/");
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        try {
          await app.vault.createFolder(currentPath);
        } catch {}
      }
    }

    // Download from YouTube CDN
    const remoteUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const res = await requestUrl({ url: remoteUrl });
    if (res.status === 200 && res.arrayBuffer) {
      const createdFile = await app.vault.createBinary(targetPath, res.arrayBuffer);
      return app.vault.getResourcePath(createdFile);
    }
  } catch (err) {
    console.debug(`[Tablite] Failed to cache YT thumbnail for ${videoId}:`, err);
  }

  // Fallback to online CDN URL
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Batch downloads all YouTube thumbnails from a dataset and saves them into the vault.
 */
export async function downloadAllYtThumbnails(
  app: App,
  data: string[][],
): Promise<number> {
  const allUrls: string[] = [];
  for (const row of data) {
    for (const cell of row) {
      if (typeof cell === "string" && (cell.includes("youtube.com") || cell.includes("youtu.be"))) {
        const id = extractYouTubeVideoId(cell);
        if (id) allUrls.push(id);
      }
    }
  }

  const uniqueIds = Array.from(new Set(allUrls));
  if (uniqueIds.length === 0) {
    new Notice("No YouTube URLs found in table.");
    return 0;
  }

  new Notice(`📥 Caching ${uniqueIds.length} YouTube thumbnails to ${YT_THUMBNAIL_CACHE_DIR}...`);
  let count = 0;

  for (const id of uniqueIds) {
    try {
      const res = await getOrDownloadYtThumbnail(app, id);
      if (res) count++;
    } catch {}
  }

  new Notice(`✓ Cached ${count} YouTube thumbnails in vault!`);
  return count;
}
