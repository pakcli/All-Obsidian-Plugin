/** Dependency health check for YT Extension */
import { Notice, requestUrl } from "obsidian";
import { runCommand, resolveBinary, ensureWinGetInPath } from "./process";
import type { YTCaptureSettings } from "../types";

export interface HealthStatus {
  internet: boolean;
  ytDlp: boolean;
  ffmpeg: boolean;
  ytDlpVersion: string;
  ffmpegVersion: string;
  resolvedYtDlp: string;
  resolvedFfmpeg: string;
  errors: string[];
}

export async function checkYTCaptureDeps(
  settings: YTCaptureSettings
): Promise<HealthStatus> {
  ensureWinGetInPath();

  const status: HealthStatus = {
    internet: false,
    ytDlp: false,
    ffmpeg: false,
    ytDlpVersion: "",
    ffmpegVersion: "",
    resolvedYtDlp: resolveBinary(settings.ytDlpPath),
    resolvedFfmpeg: resolveBinary(settings.ffmpegPath),
    errors: [],
  };

  // 1. Internet Check using Obsidian requestUrl (bypasses browser CORS)
  try {
    const res = await requestUrl({
      url: "https://www.google.com/generate_204",
      method: "GET",
    });
    status.internet = res.status >= 200 && res.status < 400;
  } catch {
    // Fallback try youtube
    try {
      const res = await requestUrl({
        url: "https://www.youtube.com",
        method: "GET",
      });
      status.internet = res.status >= 200 && res.status < 400;
    } catch {
      status.errors.push("No internet connection or requests blocked.");
    }
  }

  // 2. yt-dlp check
  try {
    status.ytDlpVersion = (await runCommand(settings.ytDlpPath, ["--version"])).trim();
    status.ytDlp = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    status.errors.push(`yt-dlp error: ${msg.split("\n")[0]}`);
  }

  // 3. ffmpeg check
  try {
    const out = await runCommand(settings.ffmpegPath, ["-version"]);
    status.ffmpegVersion = out.split("\n")[0]?.trim() ?? "";
    status.ffmpeg = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    status.errors.push(`ffmpeg error: ${msg.split("\n")[0]}`);
  }

  return status;
}

export async function runYTCaptureStartupCheck(
  settings: YTCaptureSettings
): Promise<void> {
  const status = await checkYTCaptureDeps(settings);
  if (status.internet && status.ytDlp && status.ffmpeg) {
    return;
  }
  const lines = ["⚠ YT Extension — missing dependencies:", ...status.errors];
  new Notice(lines.join("\n"), 10_000);
}
