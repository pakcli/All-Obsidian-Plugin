/**
 * Settings tab content for YT Extension inside PakCLI Suite.
 */
import { App, Setting, Notice } from "obsidian";
import type PakCLIPlugin from "../../main";
import { checkYTCaptureDeps } from "./utils/healthCheck";
import { SetupModal } from "./ui/SetupModal";
import { findWinGetBinary } from "./utils/process";
import { downloadYtDlpDirect } from "./utils/downloader";

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
  new Setting(setupSection).setName("⚙️ Setup & Dependencies").setHeading();
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
    new SetupModal(app, plugin, () => {
      window.setTimeout(() => runCheck(), 1500);
    }).open();
  });

  const directDlBtn = btnRow.createEl("button", {
    cls: "ytec-settings-btn ytec-settings-btn-secondary",
    text: "⬇ Direct Download yt-dlp",
  });
  directDlBtn.addEventListener("click", async () => {
    directDlBtn.textContent = "⏳ Downloading…";
    try {
      await downloadYtDlpDirect(plugin);
      await runCheck();
      directDlBtn.textContent = "✓ Downloaded!";
      window.setTimeout(() => { directDlBtn.textContent = "⬇ Direct Download yt-dlp"; }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      directDlBtn.textContent = "✗ Failed";
      new Notice(`Download failed: ${msg}`);
      window.setTimeout(() => { directDlBtn.textContent = "⬇ Direct Download yt-dlp"; }, 3000);
    }
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
  new Setting(pathsSection).setName("🔧 Tool Paths").setHeading();
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
  new Setting(captureSection).setName("🎬 Capture").setHeading();

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

  new Setting(captureSection)
    .setName("Create .zip archive")
    .setDesc("When enabled, additionally packages media attachments into a .zip archive. When disabled, attachments (.mp4, .jpg, .md) are saved unzipped directly into your vault.")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.ytCaptureCreateZip ?? false)
        .onChange(async (v) => {
          plugin.settings.ytCaptureCreateZip = v;
          await plugin.saveSettings();
        })
    );

  const presetsList = [...(plugin.settings.presets || [])].sort(
    (a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)
  );

  new Setting(captureSection)
    .setName("Metadata Presets")
    .setDesc("Select template preset for note frontmatter. The latest used preset is automatically sorted to the top.")
    .addDropdown((dropdown) => {
      presetsList.forEach((p) => dropdown.addOption(p.id, p.name));
      dropdown.setValue(plugin.settings.activePresetId || presetsList[0]?.id || "yt_evidence_standard");
      dropdown.onChange(async (selectedId) => {
        plugin.settings.activePresetId = selectedId;
        const target = (plugin.settings.presets || []).find((p) => p.id === selectedId);
        if (target) {
          target.lastUsedAt = Date.now();
        }
        await plugin.saveSettings();
        renderYTCaptureSettings(app, plugin, containerEl);
      });
    });

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 4 — Debug & Diagnostics (Inside Obsidian UI)
  // ══════════════════════════════════════════════════════════════════════════

  const debugSection = containerEl.createDiv({ cls: "ytec-settings-section" });
  new Setting(debugSection).setName("🔍 Debug & Diagnostics").setHeading();
  debugSection.createEl("p", {
    cls: "ytec-settings-desc",
    text: "Detailed system paths and binary resolution info for troubleshooting.",
  });

  const debugLogEl = debugSection.createEl("pre", {
    cls: "ytec-confirm-code",
  });

  const runDebugDiagnostics = async () => {
    debugLogEl.textContent = "Running diagnostics…";
    const status = await checkYTCaptureDeps(plugin.settings);

    const wingetYtDlp = findWinGetBinary("yt-dlp");
    const wingetFfmpeg = findWinGetBinary("ffmpeg");

    const lines = [
      `=== ENVIRONMENT ===`,
      `Platform: ${process.platform}`,
      `Node Version: ${process.version}`,
      `PATH: ${process.env.PATH || "empty"}`,
      ``,
      `=== BINARY RESOLUTION ===`,
      `Configured yt-dlp path: "${plugin.settings.ytDlpPath}"`,
      `Resolved yt-dlp path:   "${status.resolvedYtDlp}"`,
      `WinGet fallback yt-dlp: "${wingetYtDlp || "not found"}"`,
      `yt-dlp check status:    ${status.ytDlp ? "OK (" + status.ytDlpVersion + ")" : "FAILED"}`,
      ``,
      `Configured ffmpeg path: "${plugin.settings.ffmpegPath}"`,
      `Resolved ffmpeg path:   "${status.resolvedFfmpeg}"`,
      `WinGet fallback ffmpeg: "${wingetFfmpeg || "not found"}"`,
      `ffmpeg check status:    ${status.ffmpeg ? "OK (" + status.ffmpegVersion + ")" : "FAILED"}`,
      ``,
      `=== INTERNET & ERRORS ===`,
      `Internet status:        ${status.internet ? "OK" : "FAILED"}`,
    ];

    if (status.errors.length > 0) {
      lines.push(``, `=== ERRORS DETECTED ===`, ...status.errors);
    }

    debugLogEl.textContent = lines.join("\n");
  };

  runDebugDiagnostics();

  const debugBtnRow = debugSection.createDiv({ cls: "ytec-settings-btn-row" });
  const diagBtn = debugBtnRow.createEl("button", {
    cls: "ytec-settings-btn ytec-settings-btn-secondary",
    text: "🔍 Re-run Diagnostics",
  });
  diagBtn.addEventListener("click", () => runDebugDiagnostics());

  // Auto-fix button if Winget binaries were detected but not set in settings
  const autoFixBtn = debugBtnRow.createEl("button", {
    cls: "ytec-settings-btn ytec-settings-btn-primary",
    text: "⚡ Auto-Detect & Fix Binary Paths",
  });
  autoFixBtn.addEventListener("click", async () => {
    const wingetYtDlp = findWinGetBinary("yt-dlp");
    const wingetFfmpeg = findWinGetBinary("ffmpeg");

    if (wingetYtDlp) {
      plugin.settings.ytDlpPath = wingetYtDlp;
    }
    if (wingetFfmpeg) {
      plugin.settings.ffmpegPath = wingetFfmpeg;
    }

    await plugin.saveSettings();
    renderYTCaptureSettings(app, plugin, containerEl);
  });
}
