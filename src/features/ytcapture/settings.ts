/**
 * Settings tab content for YT Capture tab inside PakCLI Suite.
 */
import { App, Setting } from "obsidian";
import type PakCLIPlugin from "../../main";
import { checkYTCaptureDeps } from "./utils/healthCheck";
import { SetupModal } from "./ui/SetupModal";

function statusIcon(ok: boolean): string {
  return ok ? "✅" : "❌";
}

function statusText(ok: boolean, label: string, detail?: string): string {
  return `${statusIcon(ok)} ${label}${detail ? `  (${detail})` : ""}`;
}

export function renderYTCaptureSettings(
  app: App,
  plugin: PakCLIPlugin,
  containerEl: HTMLElement
): void {
  containerEl.empty();
  containerEl.addClass("ytec-settings");

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 1 — Setup & Dependencies
  // ══════════════════════════════════════════════════════════════════════════

  const setupSection = containerEl.createDiv({ cls: "ytec-settings-section" });

  setupSection.createEl("h2", {
    cls: "ytec-settings-heading",
    text: "⚙️  Setup & Dependencies",
  });
  setupSection.createEl("p", {
    cls: "ytec-settings-desc",
    text: "yt-dlp and ffmpeg must be installed on your system for YT Extension to work.",
  });

  const statusPanel = setupSection.createDiv({ cls: "ytec-dep-panel" });

  const internetEl = statusPanel.createDiv({ cls: "ytec-dep-row" });
  internetEl.textContent = "🔄 Checking internet…";

  const ytdlpEl = statusPanel.createDiv({ cls: "ytec-dep-row" });
  ytdlpEl.textContent = "🔄 Checking yt-dlp…";

  const ffmpegEl = statusPanel.createDiv({ cls: "ytec-dep-row" });
  ffmpegEl.textContent = "🔄 Checking ffmpeg…";

  const runCheck = async () => {
    internetEl.textContent = "🔄 Checking internet…";
    ytdlpEl.textContent = "🔄 Checking yt-dlp…";
    ffmpegEl.textContent = "🔄 Checking ffmpeg…";

    const s = await checkYTCaptureDeps(plugin.settings);
    internetEl.textContent = statusText(s.internet, "Internet");
    ytdlpEl.textContent = statusText(s.ytDlp, "yt-dlp", s.ytDlpVersion || undefined);
    ffmpegEl.textContent = statusText(
      s.ffmpeg,
      "ffmpeg",
      s.ffmpegVersion ? s.ffmpegVersion.slice(0, 40) : undefined
    );
  };

  runCheck();

  const btnRow = setupSection.createDiv({ cls: "ytec-settings-btn-row" });

  const refreshBtn = btnRow.createEl("button", {
    cls: "ytec-settings-btn ytec-settings-btn-secondary",
    text: "🔄 Refresh Status",
  });
  refreshBtn.addEventListener("click", () => runCheck());

  const installBtn = btnRow.createEl("button", {
    cls: "ytec-settings-btn ytec-settings-btn-primary",
    text: "▶ Install Dependencies",
  });
  installBtn.addEventListener("click", () => {
    new SetupModal(app, plugin.settings, () => {
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
  pathsSection.createEl("h2", {
    cls: "ytec-settings-heading",
    text: "🔧  Tool Paths",
  });
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
        .setValue(plugin.settings.ytDlpPath || "yt-dlp")
        .onChange(async (v) => {
          plugin.settings.ytDlpPath = v.trim() || "yt-dlp";
          await plugin.saveSettings();
        })
    );

  new Setting(pathsSection)
    .setName("ffmpeg path")
    .setDesc("Binary name or full path to ffmpeg.")
    .addText((t) =>
      t
        .setPlaceholder("ffmpeg")
        .setValue(plugin.settings.ffmpegPath || "ffmpeg")
        .onChange(async (v) => {
          plugin.settings.ffmpegPath = v.trim() || "ffmpeg";
          await plugin.saveSettings();
        })
    );

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 3 — Capture Settings
  // ══════════════════════════════════════════════════════════════════════════

  const captureSection = containerEl.createDiv({ cls: "ytec-settings-section" });
  captureSection.createEl("h2", {
    cls: "ytec-settings-heading",
    text: "🎬  Capture Settings",
  });

  new Setting(captureSection)
    .setName("Output folder")
    .setDesc("Vault folder where .zip archives are saved. Created automatically if it doesn't exist.")
    .addText((t) =>
      t
        .setPlaceholder("YT Captures")
        .setValue(plugin.settings.ytCaptureOutputFolder || "YT Captures")
        .onChange(async (v) => {
          plugin.settings.ytCaptureOutputFolder = v.trim() || "YT Captures";
          await plugin.saveSettings();
        })
    );

  new Setting(captureSection)
    .setName("Default clip duration")
    .setDesc("How many seconds to capture from the timestamp. Can be edited per capture.")
    .addSlider((s) =>
      s
        .setLimits(5, 300, 5)
        .setValue(plugin.settings.ytCaptureDefaultDuration || 10)
        .setDynamicTooltip()
        .onChange(async (v) => {
          plugin.settings.ytCaptureDefaultDuration = v;
          await plugin.saveSettings();
        })
    );
}
