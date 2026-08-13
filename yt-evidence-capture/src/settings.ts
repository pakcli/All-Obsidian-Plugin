import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type YTEvidenceCapturePlugin from "./main";
import { checkDependencies } from "./utils/healthCheck";
import { SetupModal } from "./ui/SetupModal";

export interface YTEvidenceSettings {
  ytDlpPath: string;
  ffmpegPath: string;
  outputFolder: string;
  defaultDuration: number;
}

export const DEFAULT_SETTINGS: YTEvidenceSettings = {
  ytDlpPath: "yt-dlp",
  ffmpegPath: "ffmpeg",
  outputFolder: "YT Captures",
  defaultDuration: 10,
};

// ─── Status icon helpers ──────────────────────────────────────────────────────

function statusIcon(ok: boolean): string {
  return ok ? "✅" : "❌";
}

function statusText(ok: boolean, label: string, detail?: string): string {
  return `${statusIcon(ok)} ${label}${detail ? `  (${detail})` : ""}`;
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

export class YTEvidenceSettingTab extends PluginSettingTab {
  plugin: YTEvidenceCapturePlugin;

  constructor(app: App, plugin: YTEvidenceCapturePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ytec-settings");

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 1 — Setup & Dependencies
    // ══════════════════════════════════════════════════════════════════════════

    const setupSection = containerEl.createDiv({ cls: "ytec-settings-section" });

    new Setting(setupSection)
      .setName("⚙️ Setup & Dependencies")
      .setHeading();

    setupSection.createEl("p", {
      cls: "ytec-settings-desc",
      text: "yt-dlp and ffmpeg must be installed on your system for the plugin to work.",
    });

    // ── Status panel ─────────────────────────────────────────────────────────
    const statusPanel = setupSection.createDiv({ cls: "ytec-dep-panel" });

    const internetEl = statusPanel.createDiv({ cls: "ytec-dep-row" });
    internetEl.textContent = "🔄 Checking internet…";

    const ytdlpEl = statusPanel.createDiv({ cls: "ytec-dep-row" });
    ytdlpEl.textContent = "🔄 Checking yt-dlp…";

    const ffmpegEl = statusPanel.createDiv({ cls: "ytec-dep-row" });
    ffmpegEl.textContent = "🔄 Checking ffmpeg…";

    // Run check and fill in results
    const runCheck = async () => {
      internetEl.textContent = "🔄 Checking internet…";
      ytdlpEl.textContent = "🔄 Checking yt-dlp…";
      ffmpegEl.textContent = "🔄 Checking ffmpeg…";

      const s = await checkDependencies(this.plugin.settings);
      internetEl.textContent = statusText(s.internet, "Internet");
      ytdlpEl.textContent = statusText(s.ytDlp, "yt-dlp", s.ytDlpVersion || undefined);
      ffmpegEl.textContent = statusText(
        s.ffmpeg,
        "ffmpeg",
        s.ffmpegVersion ? s.ffmpegVersion.slice(0, 40) : undefined
      );
    };

    // Run immediately when tab opens
    runCheck();

    // ── Action buttons ────────────────────────────────────────────────────────
    const btnRow = setupSection.createDiv({ cls: "ytec-settings-btn-row" });

    // Refresh status
    const refreshBtn = btnRow.createEl("button", {
      cls: "ytec-settings-btn ytec-settings-btn-secondary",
      text: "🔄 Refresh Status",
    });
    refreshBtn.addEventListener("click", () => runCheck());

    // Install dependencies (opens SetupModal with confirmation)
    const installBtn = btnRow.createEl("button", {
      cls: "ytec-settings-btn ytec-settings-btn-primary",
      text: "▶ Install Dependencies",
    });
    installBtn.addEventListener("click", () => {
      new SetupModal(this.app, this.plugin.settings, () => {
        // Re-check status after install finishes
        setTimeout(() => runCheck(), 1500);
      }).open();
    });

    setupSection.createEl("div", {
      cls: "ytec-settings-hint",
      text:
        "Clicking Install will run: winget install yt-dlp.yt-dlp  +  winget install Gyan.FFmpeg — requires winget (Windows only).",
    });

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 2 — Tool Paths
    // ══════════════════════════════════════════════════════════════════════════

    const pathsSection = containerEl.createDiv({ cls: "ytec-settings-section" });
    new Setting(pathsSection)
      .setName("🔧 Tool Paths")
      .setHeading();

    pathsSection.createEl("p", {
      cls: "ytec-settings-desc",
      text: 'Leave as "yt-dlp" / "ffmpeg" if they are on your system PATH. Set a full path (e.g. C:\\Tools\\yt-dlp.exe) if not.',
    });

    new Setting(pathsSection)
      .setName("yt-dlp path")
      .setDesc("Binary name or full path to yt-dlp.")
      .addText((t) =>
        t
          .setPlaceholder("yt-dlp")
          .setValue(this.plugin.settings.ytDlpPath)
          .onChange(async (v) => {
            this.plugin.settings.ytDlpPath = v.trim() || "yt-dlp";
            await this.plugin.saveSettings();
          })
      );

    new Setting(pathsSection)
      .setName("ffmpeg path")
      .setDesc("Binary name or full path to ffmpeg.")
      .addText((t) =>
        t
          .setPlaceholder("ffmpeg")
          .setValue(this.plugin.settings.ffmpegPath)
          .onChange(async (v) => {
            this.plugin.settings.ffmpegPath = v.trim() || "ffmpeg";
            await this.plugin.saveSettings();
          })
      );

    // ══════════════════════════════════════════════════════════════════════════
    //  SECTION 3 — Capture Settings
    // ══════════════════════════════════════════════════════════════════════════

    const captureSection = containerEl.createDiv({ cls: "ytec-settings-section" });
    new Setting(captureSection)
      .setName("🎬 Capture")
      .setHeading();

    new Setting(captureSection)
      .setName("Output folder")
      .setDesc("Vault folder where .zip archives are saved. Created automatically if it doesn't exist.")
      .addText((t) =>
        t
          .setPlaceholder("YT Captures")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (v) => {
            this.plugin.settings.outputFolder = v.trim() || "YT Captures";
            await this.plugin.saveSettings();
          })
      );

    new Setting(captureSection)
      .setName("Default clip duration")
      .setDesc("How many seconds to capture from the timestamp. Can be edited per capture.")
      .addSlider((s) =>
        s
          .setLimits(5, 300, 5)
          .setValue(this.plugin.settings.defaultDuration)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.defaultDuration = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
