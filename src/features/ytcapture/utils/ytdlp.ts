/**
 * yt-dlp wrapper functions for PakCLI Suite.
 */
import * as path from "path";
import * as fs from "fs";
import { requestUrl } from "obsidian";
import type { YTCaptureSettings, YtDlpInfo, VideoQuality, VideoFps } from "../types";
import { runCommand, resolveBinary } from "./process";

export async function fetchVideoInfo(
  url: string,
  settings: YTCaptureSettings
): Promise<YtDlpInfo> {
  const stdout = await runCommand(settings.ytDlpPath, [
    "--dump-json",
    "--skip-download",
    "--no-playlist",
    "--no-colors",
    url,
  ]);

  // Robust JSON parsing: find first '{' and last '}' to ignore any stdout warning lines
  const jsonStart = stdout.indexOf("{");
  const jsonEnd = stdout.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(jsonStr) as YtDlpInfo;
    } catch {
      // Fallback parse attempt
    }
  }

  try {
    return JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new Error("yt-dlp returned invalid metadata. Try updating yt-dlp via plugin settings.");
  }
}

export async function downloadClip(
  url: string,
  start: number,
  end: number,
  outputPath: string,
  settings: YTCaptureSettings,
  quality: VideoQuality = "best",
  fps: VideoFps = "auto",
  onProgress?: (msg: string) => void
): Promise<void> {
  let formatStr = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/18/best[ext=mp4]/best";

  if (quality === "audio") {
    formatStr = "bestaudio[ext=m4a]/bestaudio/best";
  } else {
    let maxH = "";
    if (quality === "1080p") maxH = "[height<=1080]";
    else if (quality === "720p") maxH = "[height<=720]";
    else if (quality === "480p") maxH = "[height<=480]";
    else if (quality === "360p") maxH = "[height<=360]";

    let maxFps = "";
    if (fps === "60") maxFps = "[fps<=60]";
    else if (fps === "30") maxFps = "[fps<=30]";

    formatStr = `bestvideo${maxH}${maxFps}[ext=mp4]+bestaudio[ext=m4a]/18/best${maxH}${maxFps}[ext=mp4]/best`;
  }

  const args: string[] = [
    "--newline",
    "--extractor-args",
    "youtube:player_client=mweb,android,web",
    "--download-sections",
    `*${start}-${end}`,
    "--force-keyframes-at-cuts",
    "-f",
    formatStr,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-colors",
    "-o",
    outputPath,
    url,
  ];

  const ffmpegCmd = resolveBinary(settings.ffmpegPath || "ffmpeg");
  if (ffmpegCmd) {
    args.unshift("--ffmpeg-location", ffmpegCmd);
  }

  await runCommand(settings.ytDlpPath, args, { onOutput: onProgress });
}

export async function downloadSubtitles(
  url: string,
  outputDir: string,
  settings: YTCaptureSettings
): Promise<void> {
  const ffmpegCmd = resolveBinary(settings.ffmpegPath || "ffmpeg");
  const ffmpegArgs = ffmpegCmd ? ["--ffmpeg-location", ffmpegCmd] : [];

  await runCommand(
    settings.ytDlpPath,
    [
      ...ffmpegArgs,
      "--skip-download", "--write-subs", "--write-auto-subs",
      "--sub-langs", "en.*,en", "--sub-format", "json3",
      "--no-playlist", "--no-colors", "-o", path.join(outputDir, "%(id)s.%(ext)s"),
      url,
    ]
  ).catch(() => {/* silently ignore */});

  const hasSubFile = fs.readdirSync(outputDir).some((f) => f.endsWith(".json3"));
  if (!hasSubFile) {
    await runCommand(
      settings.ytDlpPath,
      [
        ...ffmpegArgs,
        "--skip-download", "--write-subs", "--write-auto-subs",
        "--sub-langs", "all", "--sub-format", "json3",
        "--no-playlist", "--no-colors", "-o", path.join(outputDir, "%(id)s.%(ext)s"),
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
