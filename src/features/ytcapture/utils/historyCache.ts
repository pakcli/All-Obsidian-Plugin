import { App } from "obsidian";
import type PakCLIPlugin from "../../../main";

export interface CaptureHistoryItem {
  filePath: string;
  title: string;
  url: string;
  videoId: string;
  channel: string;
  uploadDate: string;
  capturedAt: string;
  timeRange: string;
  mtime: number;
}

export interface YTHistoryCache {
  lastScannedAt: number;
  items: Record<string, CaptureHistoryItem>;
}

/**
 * Perform incremental scan of vault output folder for YT Captures.
 * Only parses files that are new or modified since last scan.
 */
export async function getIncrementalCaptureHistory(
  app: App,
  plugin: PakCLIPlugin
): Promise<CaptureHistoryItem[]> {
  const outputFolderPath = plugin.settings.ytCaptureOutputFolder || "YT Captures";

  if (!plugin.settings.ytHistoryCache) {
    plugin.settings.ytHistoryCache = {
      lastScannedAt: 0,
      items: {},
    };
  }

  const cache = plugin.settings.ytHistoryCache;
  const currentFiles = app.vault.getFiles().filter(
    (f) => f.path.startsWith(outputFolderPath + "/") && f.extension === "md"
  );

  const currentPaths = new Set(currentFiles.map((f) => f.path));
  let cacheModified = false;

  // Clean up cache entries for deleted files
  for (const cachedPath of Object.keys(cache.items)) {
    if (!currentPaths.has(cachedPath)) {
      delete cache.items[cachedPath];
      cacheModified = true;
    }
  }

  // Incrementally scan new or modified files
  for (const file of currentFiles) {
    const cachedItem = cache.items[file.path];
    if (cachedItem && cachedItem.mtime === file.stat.mtime) {
      // Unchanged file — skip reading/parsing!
      continue;
    }

    // New or modified file — parse frontmatter
    try {
      const content = await app.vault.read(file);
      const parsed = parseYamlFrontmatter(content);

      cache.items[file.path] = {
        filePath: file.path,
        title: parsed.yt_title || parsed.title || file.basename,
        url: parsed.yt_url || parsed.url || "",
        videoId: parsed.video_id || "",
        channel: parsed.yt_channel || parsed.channel || "",
        uploadDate: parsed.yt_upload_date || parsed.upload_date || "",
        capturedAt: parsed.captured_at || new Date(file.stat.ctime).toISOString(),
        timeRange: parsed.capture_time_range || parsed.time_range || `${parsed.clip_start || ""}–${parsed.clip_end || ""}`,
        mtime: file.stat.mtime,
      };
      cacheModified = true;
    } catch {
      // Skip invalid file
    }
  }

  cache.lastScannedAt = Date.now();

  if (cacheModified) {
    await plugin.saveSettings();
  }

  // Return items sorted by mtime descending (newest first!)
  return Object.values(cache.items).sort((a, b) => b.mtime - a.mtime);
}

/** Lightweight YAML frontmatter parser using regex line extraction */
function parseYamlFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content.startsWith("---")) return result;

  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return result;

  const yamlBlock = content.slice(3, endIdx);
  const lines = yamlBlock.split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (key) {
      result[key] = val;
    }
  }

  return result;
}
