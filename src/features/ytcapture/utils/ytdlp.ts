/**
 * yt-dlp wrapper functions for PakCLI Suite.
 */
import * as path from "path";
import * as fs from "fs";
import { requestUrl } from "obsidian";
import type { YTCaptureSettings, YtDlpInfo, VideoQuality, VideoFps } from "../types";
import { runCommand } from "./process";

export async function fetchVideoInfo(
  url: string,
  settings: YTCaptureSettings
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
    // If live event ended error or extractor error, retry with player_client fallback
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
  let formatStr = "bestvideo+bestaudio/best";

  if (quality === "audio") {
    formatStr = "bestaudio/best";
  } else {
    let maxH = "";
    if (quality === "1080p") maxH = "[height<=1080]";
    else if (quality === "720p") maxH = "[height<=720]";
    else if (quality === "480p") maxH = "[height<=480]";
    else if (quality === "360p") maxH = "[height<=360]";

    let maxFps = "";
    if (fps === "60") maxFps = "[fps<=60]";
    else if (fps === "30") maxFps = "[fps<=30]";

    formatStr = `bestvideo${maxH}${maxFps}+bestaudio/best${maxH}${maxFps}/best`;
  }

  const buildArgs = (extraArgs: string[] = []): string[] => {
    const args: string[] = [
      "--download-sections",
      `*${start}-${end}`,
      "--force-keyframes-at-cuts",
      "-f",
      formatStr,
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
      "--no-playlist", "--no-live-from-start", "-o", path.join(outputDir, "%(id)s.%(ext)s"),
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
        "--no-playlist", "--no-live-from-start", "-o", path.join(outputDir, "%(id)s.%(ext)s"),
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
