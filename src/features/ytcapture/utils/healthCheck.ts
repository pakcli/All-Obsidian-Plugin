/** Dependency health check for YT Capture */
import { Notice } from "obsidian";
import { runCommand } from "./process";
import type { YTCaptureSettings } from "../types";

export interface HealthStatus {
  internet: boolean;
  ytDlp: boolean;
  ffmpeg: boolean;
  ytDlpVersion: string;
  ffmpegVersion: string;
  errors: string[];
}

export async function checkYTCaptureDeps(
  settings: YTCaptureSettings
): Promise<HealthStatus> {
  const status: HealthStatus = {
    internet: false,
    ytDlp: false,
    ffmpeg: false,
    ytDlpVersion: "",
    ffmpegVersion: "",
    errors: [],
  };

  try {
    const resp = await fetch("https://www.youtube.com/favicon.ico", {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    status.internet = resp.ok || resp.status < 500;
  } catch {
    status.errors.push("No internet — YouTube cannot be reached.");
  }

  try {
    status.ytDlpVersion = (await runCommand(settings.ytDlpPath, ["--version"])).trim();
    status.ytDlp = true;
  } catch {
    status.errors.push(
      `yt-dlp not found at "${settings.ytDlpPath}". Go to YT Capture settings and click Install Dependencies.`
    );
  }

  try {
    const out = await runCommand(settings.ffmpegPath, ["-version"]);
    status.ffmpegVersion = out.split("\n")[0]?.trim() ?? "";
    status.ffmpeg = true;
  } catch {
    status.errors.push(
      `ffmpeg not found at "${settings.ffmpegPath}". Go to YT Capture settings and click Install Dependencies.`
    );
  }

  return status;
}

export async function runYTCaptureStartupCheck(
  settings: YTCaptureSettings
): Promise<void> {
  const status = await checkYTCaptureDeps(settings);
  if (status.internet && status.ytDlp && status.ffmpeg) {
    console.log(`[PakCLI] YT Extension ready ✓ yt-dlp ${status.ytDlpVersion}`);
    return;
  }
  const lines = ["⚠ YT Extension — missing dependencies:", ...status.errors];
  new Notice(lines.join("\n"), 12_000);
}
