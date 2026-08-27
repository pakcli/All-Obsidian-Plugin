/**
 * yt-dlp wrapper functions.
 * All operations are async and surface clear error messages.
 */
import * as path from "path";
import * as fs from "fs";
import { requestUrl } from "obsidian";
import type { YTEvidenceSettings } from "../settings";
import type { YtDlpInfo } from "../types";
import { runCommand } from "./process";

// ─── Metadata ────────────────────────────────────────────────────────────────

/**
 * Fetch full video metadata via `yt-dlp --dump-json`.
 * Does not download anything — usually completes in 2–5 s.
 */
export async function fetchVideoInfo(
  url: string,
  settings: YTEvidenceSettings
): Promise<YtDlpInfo> {
  const baseArgs = [
    "--dump-json",
    "--skip-download",
    "--no-playlist",
    "--no-live-from-start",
    url,
  ];

  let stdout = "";
  try {
    stdout = await runCommand(settings.ytDlpPath, baseArgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("live event has ended") || msg.toLowerCase().includes("this live event has ended")) {
      try {
        stdout = await runCommand(settings.ytDlpPath, [
          "--dump-json",
          "--skip-download",
          "--no-playlist",
          "--no-live-from-start",
          "--extractor-args",
          "youtube:player_client=android,ios,mweb,web",
          url,
        ]);
      } catch {
        throw new Error("This live stream has ended and YouTube is still processing the recording. Please wait a few minutes and try again.");
      }
    } else {
      throw err;
    }
  }

  try {
    return JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new Error("yt-dlp returned invalid JSON. Is yt-dlp up to date?");
  }
}

// ─── Clip download ────────────────────────────────────────────────────────────

/**
 * Download a clipped segment of a YouTube video using yt-dlp + ffmpeg.
 *
 * Uses `--download-sections` with `--force-keyframes-at-cuts` for accurate trimming.
 * Output is always merged to mp4.
 */
export async function downloadClip(
  url: string,
  start: number,
  end: number,
  outputPath: string,
  settings: YTEvidenceSettings,
  onProgress?: (msg: string) => void
): Promise<void> {
  const buildArgs = (extraArgs: string[] = []): string[] => {
    const args: string[] = [
      "--download-sections",
      `*${start}-${end}`,
      "--force-keyframes-at-cuts",
      "-f",
      "bestvideo+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-live-from-start",
      ...extraArgs,
      "-o",
      outputPath,
      url,
    ];
    if (settings.ffmpegPath && settings.ffmpegPath !== "ffmpeg") {
      args.unshift("--ffmpeg-location", settings.ffmpegPath);
    }
    return args;
  };

  try {
    await runCommand(settings.ytDlpPath, buildArgs(), { onStderr: onProgress });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("live event has ended") || msg.toLowerCase().includes("this live event has ended")) {
      try {
        await runCommand(
          settings.ytDlpPath,
          buildArgs(["--extractor-args", "youtube:player_client=android,ios,mweb,web"]),
          { onStderr: onProgress }
        );
      } catch {
        throw new Error(
          "This live stream has ended and YouTube is still processing the video. Please wait a few minutes and try again."
        );
      }
    } else {
      throw err;
    }
  }
}

// ─── Subtitle download ────────────────────────────────────────────────────────

/**
 * Download subtitles (manual + auto-generated) to a directory.
 * Tries English first; falls back to any available language.
 * Output format is json3 for easy parsing.
 */
export async function downloadSubtitles(
  url: string,
  outputDir: string,
  settings: YTEvidenceSettings
): Promise<void> {
  // yt-dlp outputs subtitle files as: {id}.{lang}.json3
  await runCommand(
    settings.ytDlpPath,
    [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "en.*,en",
      "--sub-format",
      "json3",
      "--no-playlist",
      "--no-live-from-start",
      "-o",
      path.join(outputDir, "%(id)s.%(ext)s"),
      url,
    ],
    {
      // Not fatal — subtitles may simply not exist
    }
  ).catch(() => {
    /* silently ignore — caller handles missing files */
  });

  // If no English subtitles, try to get any language
  const hasSubFile = fs
    .readdirSync(outputDir)
    .some((f) => f.endsWith(".json3"));

  if (!hasSubFile) {
    await runCommand(
      settings.ytDlpPath,
      [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "all",
        "--sub-format",
        "json3",
        "--no-playlist",
        "--no-live-from-start",
        "-o",
        path.join(outputDir, "%(id)s.%(ext)s"),
        url,
      ]
    ).catch(() => {/* ignore */});
  }
}

// ─── Thumbnail download ────────────────────────────────────────────────────────

/**
 * Download thumbnail image and return as ArrayBuffer.
 * Uses Obsidian's requestUrl to bypass CORS.
 */
export async function downloadThumbnail(thumbnailUrl: string): Promise<ArrayBuffer> {
  const resp = await requestUrl({ url: thumbnailUrl, method: "GET" });
  return resp.arrayBuffer;
}

/**
 * Find the first subtitle json3 file in a directory.
 */
export function findSubtitleFile(dir: string): string | null {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json3"));
  return files.length > 0 ? path.join(dir, files[0]) : null;
}
