/**
 * SetupModal — confirmation + live progress for dependency installation in PakCLI.
 * Includes direct GitHub download fallback for yt-dlp if Winget fails.
 */
import { App, Modal, requestUrl } from "obsidian";
import type PakCLIPlugin from "../../../main";
import { runCommand, ensureWinGetInPath } from "../utils/process";
import { ensureYtDlpAvailable, downloadYtDlpDirect } from "../utils/downloader";

type SetupStep = "confirm" | "running" | "done";

export class SetupModal extends Modal {
  private step: SetupStep = "confirm";
  private plugin: PakCLIPlugin;
  private logEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onComplete: () => void;

  constructor(app: App, plugin: PakCLIPlugin, onComplete: () => void) {
    super(app);
    this.plugin = plugin;
    this.onComplete = onComplete;
    this.modalEl.addClass("ytec-modal");
  }

  onOpen(): void { this.render(); }
  onClose(): void { this.contentEl.empty(); }

  private render(): void {
    this.contentEl.empty();
    this.logEl = null;
    this.statusEl = null;

    switch (this.step) {
      case "confirm": this.renderConfirm(); break;
      case "running": this.renderRunning(); break;
      case "done":    this.renderDone();    break;
    }
  }

  private renderConfirm(): void {
    const { contentEl } = this;

    const hdr = contentEl.createDiv({ cls: "ytec-header" });
    hdr.createDiv({ cls: "ytec-logo", text: "⚙️" });
    hdr.createEl("h2", { cls: "ytec-title", text: "Install Dependencies" });
    hdr.createEl("p", {
      cls: "ytec-subtitle",
      text: "This will check, install, or download yt-dlp and ffmpeg for your system.",
    });

    const box = contentEl.createDiv({ cls: "ytec-confirm-box" });
    box.createEl("p", { cls: "ytec-confirm-label", text: "Actions that will run:" });

    const cmds = [
      "1. Check & download yt-dlp (via winget or direct GitHub release)",
      "2. Check & install ffmpeg (via winget)",
      "3. Auto-configure binary paths in settings"
    ];
    const codeEl = box.createEl("pre", { cls: "ytec-confirm-code" });
    codeEl.textContent = cmds.join("\n");

    box.createEl("p", {
      cls: "ytec-confirm-note",
      text: "Already installed and working tools will be kept as-is.",
    });

    const actions = contentEl.createDiv({ cls: "ytec-actions ytec-actions-row" });

    const cancelBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-ghost",
      text: "Cancel",
    });
    cancelBtn.addEventListener("click", () => this.close());

    const runBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-primary",
      text: "▶ Run Setup",
    });
    runBtn.addEventListener("click", () => this.runSetup());
  }

  private renderRunning(): void {
    const { contentEl } = this;

    const wrap = contentEl.createDiv({ cls: "ytec-processing" });
    wrap.createDiv({ cls: "ytec-spinner" });
    this.statusEl = wrap.createEl("p", {
      cls: "ytec-status-text",
      text: "Running setup…",
    });

    this.logEl = contentEl.createDiv({ cls: "ytec-log" });
  }

  private setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private addLog(msg: string): void {
    if (!this.logEl) return;
    this.logEl.createEl("div", { cls: "ytec-log-entry", text: msg });
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private async runSetup(): Promise<void> {
    this.step = "running";
    this.render();
    ensureWinGetInPath();

    const errors: string[] = [];

    // 1. Internet Check using requestUrl
    this.setStatus("Checking internet…");
    this.addLog("Testing network connection via requestUrl…");
    try {
      const res = await requestUrl({
        url: "https://www.google.com/generate_204",
        method: "GET",
      });
      if (res.status >= 200 && res.status < 400) {
        this.addLog("✓ Internet connection OK");
      } else {
        this.addLog(`⚠ Network returned status ${res.status}`);
      }
    } catch {
      this.addLog("⚠ Could not verify network via requestUrl, continuing anyway…");
    }

    // 2. Install / Ensure yt-dlp
    this.setStatus("Setting up yt-dlp…");
    this.addLog("Checking yt-dlp status…");

    let ytdlpOk = false;
    try {
      // First try winget if available
      try {
        this.addLog("Attempting: winget install yt-dlp.yt-dlp");
        await runCommand("winget", [
          "install", "--id", "yt-dlp.yt-dlp",
          "-e", "--accept-source-agreements", "--accept-package-agreements"
        ], { onStderr: (d) => this.addLog(d.trim()) });
      } catch {
        // Ignore winget error — fallback to direct downloader
      }

      // Verify or Direct Download fallback
      ytdlpOk = await ensureYtDlpAvailable(this.plugin, (msg) => this.addLog(msg));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`⚠ yt-dlp setup note: ${msg}`);
    }

    if (!ytdlpOk) {
      this.addLog("Attempting direct download of yt-dlp.exe from GitHub…");
      try {
        await downloadYtDlpDirect(this.plugin, (msg) => this.addLog(msg));
        ytdlpOk = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.addLog(`✗ Direct download failed: ${msg}`);
        errors.push(`yt-dlp could not be installed: ${msg}`);
      }
    }

    // 3. Install / Ensure ffmpeg
    this.setStatus("Setting up ffmpeg…");
    this.addLog("Checking ffmpeg status…");

    try {
      const v = await runCommand(this.plugin.settings.ffmpegPath, ["-version"]);
      this.addLog(`✓ ffmpeg ready (${v.split("\n")[0].trim()})`);
    } catch {
      this.addLog("Attempting winget install for ffmpeg…");
      try {
        await runCommand("winget", [
          "install", "--id", "Gyan.FFmpeg",
          "-e", "--accept-source-agreements", "--accept-package-agreements"
        ], { onStderr: (d) => this.addLog(d.trim()) });

        const v = await runCommand(this.plugin.settings.ffmpegPath, ["-version"]);
        this.addLog(`✓ ffmpeg installed successfully (${v.split("\n")[0].trim()})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.addLog(`⚠ ffmpeg winget note: ${msg}`);
        // Check if ffmpeg is on system PATH anyway
        try {
          const v = await runCommand("ffmpeg", ["-version"]);
          this.plugin.settings.ffmpegPath = "ffmpeg";
          await this.plugin.saveSettings();
          this.addLog(`✓ ffmpeg found on PATH (${v.split("\n")[0].trim()})`);
        } catch {
          errors.push(`ffmpeg issue: Could not run ffmpeg. Please install ffmpeg or set path in settings.`);
        }
      }
    }

    this.addLog("");
    this.addLog(errors.length === 0 ? "✅ All dependencies configured!" : "⚠ Completed with warnings.");

    this.step = "done";
    this.render();
    this.onComplete();
  }

  private renderDone(): void {
    const { contentEl } = this;

    const wrap = contentEl.createDiv({ cls: "ytec-done" });
    wrap.createDiv({ cls: "ytec-done-icon", text: "✓" });
    wrap.createEl("h2", { cls: "ytec-done-title", text: "Setup Complete" });
    wrap.createEl("p", {
      cls: "ytec-subtitle",
      text: "yt-dlp and ffmpeg setup has finished.",
    });

    const actions = contentEl.createDiv({ cls: "ytec-actions" });
    const closeBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-primary ytec-btn-full",
      text: "Close",
    });
    closeBtn.addEventListener("click", () => this.close());
  }

  private renderDoneWithErrors(errors: string[]): void {
    const { contentEl } = this;
    contentEl.empty();

    const wrap = contentEl.createDiv({ cls: "ytec-done" });
    wrap.createDiv({ cls: "ytec-done-icon ytec-done-icon-warn", text: "⚠" });
    wrap.createEl("h2", { cls: "ytec-done-title ytec-done-title-warn", text: "Setup Warning" });

    const errBox = contentEl.createDiv({ cls: "ytec-error" });
    errBox.textContent = errors.join("\n");

    const actions = contentEl.createDiv({ cls: "ytec-actions" });
    const closeBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-ghost ytec-btn-full",
      text: "Close",
    });
    closeBtn.addEventListener("click", () => this.close());
  }
}
