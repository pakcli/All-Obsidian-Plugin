/**
 * CaptureModal — multi-step evidence capture UI.
 *
 * Steps:  input → preview → processing → done
 *
 * Each step is rendered by clearing contentEl and building fresh DOM.
 * Processing status/log refs are stored on the instance so async
 * work can update them after await points.
 */
import { App, FileSystemAdapter, Modal, Notice, TFile } from "obsidian";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type YTEvidenceCapturePlugin from "../main";
import type { VideoPreview, CaptureResult, TranscriptEntry } from "../types";
import { parseYouTubeUrl, buildYouTubeUrl } from "../utils/urlParser";
import {
  fetchVideoInfo,
  downloadClip,
  downloadSubtitles,
  downloadThumbnail,
  findSubtitleFile,
} from "../utils/ytdlp";
import {
  parseSubtitleFile,
  extractClipTranscript,
  formatTranscriptForMarkdown,
} from "../utils/transcript";
import {
  sanitizeFilename,
  formatTime,
  buildNotesMarkdown,
} from "../utils/fileHelpers";
import { buildZip } from "../utils/zipBuilder";

type Step = "input" | "preview" | "processing" | "done";

export class CaptureModal extends Modal {
  private plugin: YTEvidenceCapturePlugin;

  // Persistent state across steps
  private step: Step = "input";
  private urlValue = "";
  private durationValue: number;
  private editedDuration: number;
  private preview: VideoPreview | null = null;
  private result: CaptureResult | null = null;

  // Refs to live DOM elements updated during async work
  private statusEl: HTMLElement | null = null;
  private logEl: HTMLElement | null = null;

  constructor(app: App, plugin: YTEvidenceCapturePlugin) {
    super(app);
    this.plugin = plugin;
    this.durationValue = plugin.settings.defaultDuration;
    this.editedDuration = plugin.settings.defaultDuration;
    this.modalEl.addClass("ytec-modal");
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // ─── Render dispatcher ─────────────────────────────────────────────────────

  private render(): void {
    this.contentEl.empty();
    this.statusEl = null;
    this.logEl = null;

    switch (this.step) {
      case "input":      this.renderInput(); break;
      case "preview":    this.renderPreview(); break;
      case "processing": this.renderProcessing(); break;
      case "done":       this.renderDone(); break;
    }
  }

  // ─── Step 1: Input ─────────────────────────────────────────────────────────

  private renderInput(): void {
    const { contentEl } = this;

    // Header
    const hdr = contentEl.createDiv({ cls: "ytec-header" });
    hdr.createDiv({ cls: "ytec-logo", text: "🎬" });
    hdr.createEl("h2", { cls: "ytec-title", text: "YT Evidence Capture" });
    hdr.createEl("p", {
      cls: "ytec-subtitle",
      text: "Paste a YouTube link → get a .zip with clip, thumbnail & transcript.",
    });

    // Form
    const form = contentEl.createDiv({ cls: "ytec-form" });

    // URL field
    const urlGroup = form.createDiv({ cls: "ytec-field-group" });
    urlGroup.createEl("label", { cls: "ytec-label", text: "YouTube URL" });
    const urlInput = urlGroup.createEl("input", {
      cls: "ytec-input ytec-url-input",
      type: "text",
      placeholder: "https://youtube.com/watch?v=...&t=94s",
    }) as HTMLInputElement;
    urlInput.value = this.urlValue;
    urlGroup.createEl("div", {
      cls: "ytec-hint",
      text: "Include ?t= for a specific timestamp. Without it, capture starts at 00:00.",
    });

    // Duration field
    const durGroup = form.createDiv({ cls: "ytec-field-group" });
    durGroup.createEl("label", { cls: "ytec-label", text: "Clip Duration (seconds)" });
    const durRow = durGroup.createDiv({ cls: "ytec-dur-row" });
    const durInput = durRow.createEl("input", {
      cls: "ytec-input ytec-dur-input",
      type: "number",
      placeholder: "10",
    }) as HTMLInputElement;
    durInput.value = String(this.durationValue);
    durInput.min = "1";
    durInput.max = "300";
    const durBtns = durRow.createDiv({ cls: "ytec-dur-presets" });
    for (const s of [10, 30, 60]) {
      const btn = durBtns.createEl("button", {
        cls: "ytec-preset-btn",
        text: `${s}s`,
      });
      btn.addEventListener("click", () => {
        durInput.value = String(s);
      });
    }

    // Error display
    const errorEl = contentEl.createDiv({ cls: "ytec-error ytec-hidden" });

    const showError = (msg: string) => {
      errorEl.textContent = msg;
      errorEl.removeClass("ytec-hidden");
    };

    // Action button
    const actions = contentEl.createDiv({ cls: "ytec-actions" });
    const captureBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-primary ytec-btn-full",
      text: "Fetch Preview →",
    });

    captureBtn.addEventListener("click", async () => {
      errorEl.addClass("ytec-hidden");
      const url = urlInput.value.trim();
      const dur = parseInt(durInput.value, 10);

      if (!url) { showError("Please enter a YouTube URL."); return; }

      const parsed = parseYouTubeUrl(url);
      if (!parsed) {
        showError("Could not parse YouTube URL. Check it and try again.");
        return;
      }
      if (isNaN(dur) || dur < 1) {
        showError("Duration must be at least 1 second.");
        return;
      }

      this.urlValue = url;
      this.durationValue = dur;
      this.editedDuration = dur;

      await this.goToPreview();
    });

    // Allow Enter in URL field to submit
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") captureBtn.click();
    });

    setTimeout(() => urlInput.focus(), 50);
  }

  // ─── Transition: fetch preview ─────────────────────────────────────────────

  private async goToPreview(): Promise<void> {
    this.step = "processing";
    this.render();
    this.setStatus("Fetching video info via yt-dlp…");
    this.addLog("Running: yt-dlp --dump-json --skip-download");

    try {
      const parsed = parseYouTubeUrl(this.urlValue)!;
      const info = await fetchVideoInfo(this.urlValue, this.plugin.settings);
      this.addLog(`✓ Got info: "${info.title}"`);

      const start = parsed.startSeconds;
      const end = start + this.durationValue;

      // Determine transcript availability from yt-dlp metadata
      const hasSubs =
        info.subtitles && Object.keys(info.subtitles).length > 0;
      const hasAutoCaps =
        info.automatic_captions && Object.keys(info.automatic_captions).length > 0;

      this.preview = {
        video_id: info.id,
        title: info.title,
        channel: info.channel || info.uploader,
        channel_url: info.channel_url || info.uploader_url,
        thumbnail: info.thumbnail,
        start,
        end,
        duration: this.durationValue,
        has_transcript: hasSubs || hasAutoCaps,
        video_duration: info.duration,
        upload_date: info.upload_date,
        view_count: info.view_count,
        tags: info.tags ?? [],
        description: info.description ?? "",
      };

      this.step = "preview";
      this.render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Preview failed: ${msg}`, 10_000);
      this.step = "input";
      this.render();
    }
  }

  // ─── Step 2: Preview ───────────────────────────────────────────────────────

  private renderPreview(): void {
    const p = this.preview!;
    const { contentEl } = this;

    contentEl.createEl("h2", { cls: "ytec-title ytec-preview-title", text: "Preview" });

    // Thumbnail
    const thumbWrap = contentEl.createDiv({ cls: "ytec-thumb-wrap" });
    thumbWrap.createEl("img", {
      cls: "ytec-thumb",
      attr: { src: p.thumbnail, alt: "Video thumbnail" },
    });

    // Video meta
    const meta = contentEl.createDiv({ cls: "ytec-meta" });
    meta.createEl("div", { cls: "ytec-video-title", text: p.title });
    meta.createEl("div", { cls: "ytec-channel", text: p.channel });
    meta.createEl("div", {
      cls: "ytec-video-dur",
      text: `Full video: ${formatTime(p.video_duration)}`,
    });

    // Clip settings
    const clipBox = contentEl.createDiv({ cls: "ytec-clip-box" });
    clipBox.createEl("div", {
      cls: "ytec-clip-start",
      text: `Start: ${formatTime(p.start)}`,
    });

    const durRow = clipBox.createDiv({ cls: "ytec-clip-dur-row" });
    durRow.createEl("span", { text: "Duration:" });
    const durInput = durRow.createEl("input", {
      cls: "ytec-input ytec-dur-inline",
      type: "number",
    }) as HTMLInputElement;
    durInput.value = String(this.editedDuration);
    durInput.min = "1";
    durInput.max = "300";
    durRow.createEl("span", { text: "s" });

    const endEl = clipBox.createEl("div", { cls: "ytec-clip-end" });
    const refreshEnd = () => {
      const d = parseInt(durInput.value, 10) || this.editedDuration;
      this.editedDuration = d;
      endEl.textContent = `End: ${formatTime(p.start + d)}`;
    };
    refreshEnd();
    durInput.addEventListener("input", refreshEnd);

    // Badges
    const badges = contentEl.createDiv({ cls: "ytec-badges" });
    badges.createEl("span", {
      cls: p.has_transcript
        ? "ytec-badge ytec-badge-ok"
        : "ytec-badge ytec-badge-warn",
      text: p.has_transcript ? "✓ Transcript available" : "⚠ No transcript",
    });

    // Actions
    const actions = contentEl.createDiv({ cls: "ytec-actions ytec-actions-row" });

    const backBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-ghost",
      text: "← Back",
    });
    backBtn.addEventListener("click", () => {
      this.step = "input";
      this.render();
    });

    const confirmBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-primary",
      text: "Capture →",
    });
    confirmBtn.addEventListener("click", async () => {
      this.preview!.duration = this.editedDuration;
      this.preview!.end = p.start + this.editedDuration;
      await this.doCapture();
    });
  }

  // ─── Transition: do capture ────────────────────────────────────────────────

  private async doCapture(): Promise<void> {
    if (!this.preview) return;
    const p = this.preview;

    this.step = "processing";
    this.render();

    // Temp directory for intermediate files
    const tempDir = path.join(os.tmpdir(), `ytec_${Date.now()}`);

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // ── 1. Download clip ─────────────────────────────────────────────────
      this.setStatus("Downloading clip…");
      this.addLog("Starting yt-dlp clip download…");

      const clipOutPath = path.join(tempDir, "clip.mp4");
      await downloadClip(
        this.urlValue,
        p.start,
        p.end,
        clipOutPath,
        this.plugin.settings,
        (msg) => {
          // Filter and show meaningful yt-dlp progress lines
          const line = msg.trim();
          if (line && (line.includes("%") || line.includes("[download]") || line.includes("[ffmpeg]"))) {
            this.addLog(line.substring(0, 120));
          }
        }
      );

      // Locate actual clip file (ext may differ if ffmpeg merge failed)
      let actualClipPath = clipOutPath;
      if (!fs.existsSync(clipOutPath)) {
        const candidates = fs
          .readdirSync(tempDir)
          .filter((f) => f.startsWith("clip."))
          .map((f) => path.join(tempDir, f));
        if (candidates.length === 0)
          throw new Error(
            "Clip file not found after yt-dlp run. Check yt-dlp and ffmpeg are installed correctly."
          );
        actualClipPath = candidates[0];
      }
      this.addLog("✓ Clip downloaded");

      // ── 2. Thumbnail ─────────────────────────────────────────────────────
      this.setStatus("Downloading thumbnail…");
      const thumbArrayBuffer = await downloadThumbnail(p.thumbnail);
      const thumbBuffer = Buffer.from(thumbArrayBuffer);
      this.addLog("✓ Thumbnail downloaded");

      // ── 3. Transcript ────────────────────────────────────────────────────
      this.setStatus("Fetching transcript…");
      let transcriptEntries: TranscriptEntry[] = [];

      if (p.has_transcript) {
        try {
          await downloadSubtitles(this.urlValue, tempDir, this.plugin.settings);
          const subFile = findSubtitleFile(tempDir);
          if (subFile) {
            const raw = JSON.parse(fs.readFileSync(subFile, "utf-8"));
            transcriptEntries = parseSubtitleFile(raw);
            this.addLog(`✓ Transcript: ${transcriptEntries.length} segments`);
          } else {
            this.addLog("— Subtitle file not created (may not be available)");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.addLog(`⚠ Transcript error: ${msg}`);
        }
      } else {
        this.addLog("— No transcript (video has none)");
      }

      // ── 4. Build notes.md ─────────────────────────────────────────────────
      this.setStatus("Building notes.md…");
      const capturedAt = new Date().toISOString();

      const clipTranscriptEntries = extractClipTranscript(
        transcriptEntries,
        p.start,
        p.end
      );
      const clipTranscriptText =
        clipTranscriptEntries.length > 0
          ? formatTranscriptForMarkdown(clipTranscriptEntries, false)
          : "_No transcript available for this clip._";
      const fullTranscriptText =
        transcriptEntries.length > 0
          ? formatTranscriptForMarkdown(transcriptEntries, true)
          : "_No transcript available._";

      const canonicalUrl = buildYouTubeUrl(p.video_id, p.start || undefined);

      const notesContent = buildNotesMarkdown({
        title: p.title,
        url: canonicalUrl,
        videoId: p.video_id,
        channel: p.channel,
        channelUrl: p.channel_url,
        uploadDate: p.upload_date,
        videoDuration: p.video_duration,
        capturedAt,
        clipStart: p.start,
        clipEnd: p.end,
        clipDuration: p.duration,
        viewCount: p.view_count,
        tags: p.tags,
        clipTranscript: clipTranscriptText,
        description: p.description,
        fullTranscript: fullTranscriptText,
      });

      // ── 5. Build zip ──────────────────────────────────────────────────────
      this.setStatus("Creating zip archive…");
      const zipBuffer = await buildZip({
        clipPath: actualClipPath,
        thumbData: thumbBuffer,
        notesContent,
      });
      this.addLog("✓ Zip archive created");

      // ── 6. Save to vault ──────────────────────────────────────────────────
      this.setStatus("Saving to vault…");
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const safeTitle = sanitizeFilename(p.title);
      const filename = `${safeTitle}_${dateStr}.zip`;
      const outputFolder = this.plugin.settings.outputFolder;
      const vaultFilePath = `${outputFolder}/${filename}`;

      // Ensure output folder exists
      try {
        await this.app.vault.createFolder(outputFolder);
      } catch {
        // Folder already exists — that's fine
      }

      // Write or overwrite the zip file
      const existing = this.app.vault.getAbstractFileByPath(vaultFilePath);
      // Obsidian's vault API expects ArrayBuffer; Buffer is a Uint8Array subtype
      const zipArrayBuffer = zipBuffer.buffer.slice(
        zipBuffer.byteOffset,
        zipBuffer.byteOffset + zipBuffer.byteLength
      ) as ArrayBuffer;
      if (existing instanceof TFile) {
        await this.app.vault.modifyBinary(existing, zipArrayBuffer);
      } else {
        await this.app.vault.createBinary(vaultFilePath, zipArrayBuffer);
      }

      this.addLog(`✓ Saved: ${vaultFilePath}`);

      // Filesystem path to the folder (for "reveal in explorer")
      const adapter = this.app.vault.adapter as FileSystemAdapter;
      const fsDirPath = path.join(adapter.getBasePath(), outputFolder);

      this.result = { filename, vaultPath: vaultFilePath, fsDirPath };
      this.step = "done";
      this.render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`✗ Error: ${msg}`);
      new Notice(`Capture failed: ${msg}`, 12_000);
      // Return to preview so user can retry
      this.step = "preview";
      this.render();
    } finally {
      // Always clean up temp dir
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  // ─── Step 3: Processing ────────────────────────────────────────────────────

  private renderProcessing(): void {
    const { contentEl } = this;

    const wrap = contentEl.createDiv({ cls: "ytec-processing" });
    wrap.createDiv({ cls: "ytec-spinner" });
    this.statusEl = wrap.createEl("p", {
      cls: "ytec-status-text",
      text: "Please wait…",
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

  // ─── Step 4: Done ──────────────────────────────────────────────────────────

  private renderDone(): void {
    const { contentEl } = this;

    const wrap = contentEl.createDiv({ cls: "ytec-done" });
    wrap.createDiv({ cls: "ytec-done-icon", text: "✓" });
    wrap.createEl("h2", { cls: "ytec-done-title", text: "Captured!" });

    if (this.result) {
      wrap.createEl("div", {
        cls: "ytec-done-filename",
        text: this.result.filename,
      });
      wrap.createEl("div", {
        cls: "ytec-done-path",
        text: this.result.vaultPath,
      });
    }

    const actions = contentEl.createDiv({ cls: "ytec-actions ytec-actions-col" });

    // Reveal in file explorer (Electron shell)
    if (this.result) {
      const revealBtn = actions.createEl("button", {
        cls: "ytec-btn ytec-btn-secondary",
        text: "📂 Show in File Explorer",
      });
      revealBtn.addEventListener("click", () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires -- Dynamic Electron shell import required for desktop file manager integration
          const electronModule = require("electron") as { shell: { openPath: (p: string) => Promise<string> } };
          electronModule.shell.openPath(this.result!.fsDirPath);
        } catch {
          new Notice("Could not open file explorer.");
        }
      });
    }

    const againBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-primary",
      text: "+ Capture Another",
    });
    againBtn.addEventListener("click", () => {
      this.urlValue = "";
      this.result = null;
      this.preview = null;
      this.step = "input";
      this.render();
    });

    const closeBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-ghost",
      text: "Close",
    });
    closeBtn.addEventListener("click", () => this.close());
  }
}
