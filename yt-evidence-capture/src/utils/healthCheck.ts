/**
 * Dependency health check — runs on plugin load.
 * Checks: internet connectivity, yt-dlp, ffmpeg.
 * Shows a Notice for any missing dependency.
 */
import { Notice, requestUrl } from "obsidian";
import { runCommand } from "./process";
import type { YTEvidenceSettings } from "../settings";

export interface HealthStatus {
  internet: boolean;
  ytDlp: boolean;
  ffmpeg: boolean;
  ytDlpVersion: string;
  ffmpegVersion: string;
  errors: string[];
}

/**
 * Run all dependency checks and return a status object.
 * Never throws — all errors are captured in `status.errors`.
 */
export async function checkDependencies(
  settings: YTEvidenceSettings
): Promise<HealthStatus> {
  const status: HealthStatus = {
    internet: false,
    ytDlp: false,
    ffmpeg: false,
    ytDlpVersion: "",
    ffmpegVersion: "",
    errors: [],
  };

  // ── Internet ────────────────────────────────────────────────────────────────
  try {
    const resp = await requestUrl({
      url: "https://www.youtube.com/favicon.ico",
      method: "HEAD",
    });
    status.internet = resp.status >= 200 && resp.status < 500;
  } catch {
    status.errors.push("No internet connection — YouTube cannot be reached.");
  }

  // ── yt-dlp ──────────────────────────────────────────────────────────────────
  try {
    const out = await runCommand(settings.ytDlpPath, ["--version"]);
    status.ytDlp = true;
    status.ytDlpVersion = out.trim();
  } catch {
    status.errors.push(
      `yt-dlp not found at "${settings.ytDlpPath}". Run start.ps1 or install manually.`
    );
  }

  // ── ffmpeg ──────────────────────────────────────────────────────────────────
  try {
    const out = await runCommand(settings.ffmpegPath, ["-version"]);
    status.ffmpeg = true;
    // Extract just the first line: "ffmpeg version 7.x ..."
    status.ffmpegVersion = out.split("\n")[0]?.trim() ?? "";
  } catch {
    status.errors.push(
      `ffmpeg not found at "${settings.ffmpegPath}". Run start.ps1 or install manually.`
    );
  }

  return status;
}

/**
 * Run health check and surface results as Obsidian Notices.
 * Called once during plugin onload.
 */
export async function runStartupCheck(settings: YTEvidenceSettings): Promise<void> {
  const status = await checkDependencies(settings);

  const allOk = status.internet && status.ytDlp && status.ffmpeg;

  if (allOk) {
    // Silent success — no need to bother the user
    console.log(
      `[YT Evidence Capture] Ready ✓  yt-dlp ${status.ytDlpVersion}`
    );
    return;
  }

  // Show one combined notice listing all problems
  const lines = ["⚠ YT Evidence Capture — missing dependencies:", ...status.errors];
  new Notice(lines.join("\n"), 12_000);
}
