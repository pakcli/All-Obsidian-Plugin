/**
 * SetupModal — confirmation + live progress for dependency installation in PakCLI.
 */
import { App, Modal } from "obsidian";
import { runCommand } from "../utils/process";
import type { YTCaptureSettings } from "../types";

type SetupStep = "confirm" | "running" | "done";

export class SetupModal extends Modal {
  private step: SetupStep = "confirm";
  private settings: YTCaptureSettings;
  private logEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private onComplete: () => void;

  constructor(app: App, settings: YTCaptureSettings, onComplete: () => void) {
    super(app);
    this.settings = settings;
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
      text: "This will install yt-dlp and ffmpeg on your machine via winget.",
    });

    const box = contentEl.createDiv({ cls: "ytec-confirm-box" });
    box.createEl("p", { cls: "ytec-confirm-label", text: "Commands that will run:" });

    const cmds = ["winget install yt-dlp.yt-dlp", "winget install Gyan.FFmpeg"];
    const codeEl = box.createEl("pre", { cls: "ytec-confirm-code" });
    codeEl.textContent = cmds.join("\n");

    box.createEl("p", {
      cls: "ytec-confirm-note",
      text: "Already installed tools will be skipped automatically.",
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

    const errors: string[] = [];

    this.setStatus("Checking internet…");
    this.addLog("Pinging youtube.com…");
    try {
      await fetch("https://www.youtube.com/favicon.ico", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      this.addLog("✓ Internet OK");
    } catch {
      this.addLog("✗ No internet connection");
      errors.push("No internet — connect and try again.");
      this.step = "done";
      this.render();
      return;
    }

    this.setStatus("Checking winget…");
    try {
      const v = await runCommand("winget", ["--version"]);
      this.addLog(`✓ winget ${v.trim()}`);
    } catch {
      this.addLog("✗ winget not found");
      errors.push(
        "winget not available. Install it from https://aka.ms/getwinget or install yt-dlp/ffmpeg manually."
      );
      this.step = "done";
      this.renderDoneWithErrors(errors);
      return;
    }

    this.setStatus("Installing yt-dlp…");
    this.addLog("Running: winget install yt-dlp.yt-dlp");
    try {
      await runCommand(
        "winget",
        [
          "install",
          "--id", "yt-dlp.yt-dlp",
          "-e",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        { onStderr: (d) => this.addLog(d.trim()) }
      );
      this.addLog("✓ yt-dlp installed / already up to date");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`⚠ yt-dlp: ${msg}`);
      errors.push(`yt-dlp install issue: ${msg}`);
    }

    this.setStatus("Installing ffmpeg…");
    this.addLog("Running: winget install Gyan.FFmpeg");
    try {
      await runCommand(
        "winget",
        [
          "install",
          "--id", "Gyan.FFmpeg",
          "-e",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        { onStderr: (d) => this.addLog(d.trim()) }
      );
      this.addLog("✓ ffmpeg installed / already up to date");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`⚠ ffmpeg: ${msg}`);
      errors.push(`ffmpeg install issue: ${msg}`);
    }

    this.addLog("");
    this.addLog(errors.length === 0 ? "✅ All done! Restart Obsidian if needed." : "⚠ Done with some issues.");

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
      text: "yt-dlp and ffmpeg are ready. Restart Obsidian if this is your first install.",
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
    wrap.createEl("h2", { cls: "ytec-done-title ytec-done-title-warn", text: "Setup Failed" });

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
