/**
 * yt-dlp wrapper functions for PakCLI Suite.
 */
import * as path from "path";
import * as fs from "fs";
import { requestUrl } from "obsidian";
import type { YTCaptureSettings, YtDlpInfo } from "../types";
import { runCommand } from "./process";

export async function fetchVideoInfo(
  url: string,
  settings: YTCaptureSettings
): Promise<YtDlpInfo> {
  const stdout = await runCommand(settings.ytDlpPath, [
    "--dump-json",
    "--skip-download",
    "--no-playlist",
    url,
  ]);
  try {
    return JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new Error("yt-dlp returned invalid JSON. Is yt-dlp up to date?");
  }
}

export async function downloadClip(
  url: string,
  start: number,
  end: number,
  outputPath: string,
  settings: YTCaptureSettings,
  onProgress?: (msg: string) => void
): Promise<void> {
  const args: string[] = [
    "--download-sections",
    `*${start}-${end}`,
    "--force-keyframes-at-cuts",
    "-f",
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "-o",
    outputPath,
    url,
  ];
  if (settings.ffmpegPath && settings.ffmpegPath !== "ffmpeg") {
    args.unshift("--ffmpeg-location", settings.ffmpegPath);
  }
  await runCommand(settings.ytDlpPath, args, { onStderr: onProgress });
}

export async function downloadSubtitles(
  url: string,
  outputDir: string,
  settings: YTCaptureSettings
): Promise<void> {
  await runCommand(
    settings.ytDlpPath,
    [
      "--skip-download", "--write-subs", "--write-auto-subs",
      "--sub-langs", "en.*,en", "--sub-format", "json3",
      "--no-playlist", "-o", path.join(outputDir, "%(id)s.%(ext)s"),
      url,
    ]
  ).catch(() => {/* silently ignore */});

  const hasSubFile = fs.readdirSync(outputDir).some((f) => f.endsWith(".json3"));
  if (!hasSubFile) {
    await runCommand(
      settings.ytDlpPath,
      [
        "--skip-download", "--write-subs", "--write-auto-subs",
        "--sub-langs", "all", "--sub-format", "json3",
        "--no-playlist", "-o", path.join(outputDir, "%(id)s.%(ext)s"),
        url,
      ]
    ).catch(() => {/* ignore */});
  }
}

export async function downloadThumbnail(thumbnailUrl: string): Promise<ArrayBuffer> {
  const resp = await requestUrl({ url: thumbnailUrl, method: "GET" });
  return resp.arrayBuffer;
}

export function findSubtitleFile(dir: string): string | null {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json3"));
  return files.length > 0 ? path.join(dir, files[0]) : null;
}
