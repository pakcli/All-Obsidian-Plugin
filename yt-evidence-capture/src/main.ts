/**
 * YT Evidence Capture — Plugin Entry Point
 *
 * Minimal lifecycle manager: registers the command, ribbon button,
 * and settings tab. All feature logic lives in CaptureModal.
 */
import { Notice, Plugin } from "obsidian";
import { YTEvidenceSettings, DEFAULT_SETTINGS, YTEvidenceSettingTab } from "./settings";
import { CaptureModal } from "./ui/CaptureModal";
import { runStartupCheck, checkDependencies } from "./utils/healthCheck";

export default class YTEvidenceCapturePlugin extends Plugin {
  settings: YTEvidenceSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Settings tab
    this.addSettingTab(new YTEvidenceSettingTab(this.app, this));

    // Ribbon button
    this.addRibbonIcon("film", "YT Evidence Capture", () => {
      new CaptureModal(this.app, this).open();
    });

    // Command: open capture modal
    this.addCommand({
      id: "open-capture-modal",
      name: "Capture YouTube evidence clip",
      callback: () => {
        new CaptureModal(this.app, this).open();
      },
    });

    // Command: check dependencies
    this.addCommand({
      id: "check-dependencies",
      name: "Check dependencies (internet, yt-dlp, ffmpeg)",
      callback: async () => {
        const status = await checkDependencies(this.settings);
        const lines: string[] = [
          "YT Evidence Capture — Dependency Status",
          "",
          `${status.internet ? "✓" : "✗"} Internet`,
          `${status.ytDlp   ? "✓" : "✗"} yt-dlp${ status.ytDlpVersion ? " (" + status.ytDlpVersion + ")" : ""}`,
          `${status.ffmpeg  ? "✓" : "✗"} ffmpeg${ status.ffmpegVersion ? " (" + status.ffmpegVersion.slice(0,30) + ")" : ""}`,
        ];
        if (status.errors.length > 0) {
          lines.push("", ...status.errors);
        }
        new Notice(lines.join("\n"), 10_000);
      },
    });

    // Startup health check — deferred so Obsidian finishes booting first
    setTimeout(() => runStartupCheck(this.settings), 2000);
  }

  onunload(): void {
    console.log("YT Evidence Capture: unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
