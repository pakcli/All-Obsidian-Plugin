/**
 * CaptureModal — 1:1 Component Cards evidence capture UI with video preview player,
 * Quality & FPS settings, range slider, full duration button, progress bar,
 * and active card highlighting with muted inactive cards.
 */
import { App, FileSystemAdapter, Modal, Notice, TFile } from "obsidian";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type PakCLIPlugin from "../../../main";
import type { VideoPreview, CaptureResult, TranscriptEntry, VideoQuality, VideoFps, ProgressInfo } from "../types";
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
import { parseYtDlpProgress } from "../utils/progressParser";
import { YTCaptureBackgroundManager } from "../utils/backgroundManager";

type CardId = "url" | "quality" | "range" | "preview";
type Step = "input" | "preview" | "processing" | "done";

export class CaptureModal extends Modal {
  private plugin: PakCLIPlugin;
  private bgManager: YTCaptureBackgroundManager;

  private step: Step = "input";
  private activeCardId: CardId = "url";

  private urlValue = "";
  private durationValue: number;
  private editedStart: number = 0;
  private editedEnd: number = 10;
  private selectedQuality: VideoQuality = "best";
  private selectedFps: VideoFps = "auto";

  private preview: VideoPreview | null = null;
  private result: CaptureResult | null = null;

  // Live DOM refs for progress updating
  private statusEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private progressStatsEl: HTMLElement | null = null;
  private logEl: HTMLElement | null = null;

  private currentTaskId: string | null = null;

  constructor(app: App, plugin: PakCLIPlugin) {
    super(app);
    this.plugin = plugin;
    this.bgManager = new YTCaptureBackgroundManager(plugin);
    const defDur = plugin.settings.ytCaptureDefaultDuration ?? 10;
    this.durationValue = defDur;
    this.selectedQuality = plugin.settings.ytCaptureQuality ?? "best";
    this.selectedFps = plugin.settings.ytCaptureFps ?? "auto";
    this.modalEl.addClass("ytec-modal");
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    this.statusEl = null;
    this.progressBarEl = null;
    this.progressStatsEl = null;
    this.logEl = null;

    if (this.step === "processing") {
      this.renderProcessing();
      return;
    }

    if (this.step === "done") {
      this.renderDone();
      return;
    }

    this.renderCardsLayout();
  }

  private renderCardsLayout(): void {
    const { contentEl } = this;

    const hdr = contentEl.createDiv({ cls: "ytec-header" });
    hdr.createDiv({ cls: "ytec-logo", text: "🎬" });
    hdr.createEl("h2", { cls: "ytec-title", text: "YT Extension — Evidence Capture" });
    hdr.createEl("p", {
      cls: "ytec-subtitle",
      text: "Interactive 1:1 Component Cards: Edit card values directly in place.",
    });

    const cardGrid = contentEl.createDiv({ cls: "ytec-card-grid" });

    // ── CARD 1: Source & URL (1:1 Component Card) ──────────────────────
    const cardUrl = cardGrid.createDiv({ cls: "ytec-card" });
    cardUrl.dataset.cardId = "url";

    const headerUrl = cardUrl.createDiv({ cls: "ytec-card-header" });
    headerUrl.createDiv({ cls: "ytec-card-title", text: "🎬 1. YouTube URL & Source" });
    headerUrl.createDiv({ cls: "ytec-card-badge", text: "Source" });

    const groupUrl = cardUrl.createDiv({ cls: "ytec-field-group" });
    const urlInput = groupUrl.createEl("input", {
      cls: "ytec-input ytec-url-input",
      type: "text",
      placeholder: "https://youtube.com/watch?v=...&t=94s",
    }) as HTMLInputElement;
    urlInput.value = this.urlValue;
    groupUrl.createEl("div", {
      cls: "ytec-hint",
      text: "Include ?t= for start timestamp. Edits take effect immediately.",
    });

    const durGroup = cardUrl.createDiv({ cls: "ytec-field-group" });
    durGroup.setAttribute("style", "margin-top: 10px;");
    durGroup.createEl("label", { cls: "ytec-label", text: "Default Clip Duration (seconds)" });
    const durRow = durGroup.createDiv({ cls: "ytec-dur-row" });
    const durInput = durRow.createEl("input", {
      cls: "ytec-input ytec-dur-input",
      type: "number",
      placeholder: "10",
    }) as HTMLInputElement;
    durInput.value = String(this.durationValue);
    durInput.min = "1";
    durInput.max = "7200";

    const durBtns = durRow.createDiv({ cls: "ytec-dur-presets" });
    for (const s of [10, 30, 60]) {
      const btn = durBtns.createEl("button", {
        cls: "ytec-preset-btn",
        text: `${s}s`,
      });
      btn.addEventListener("click", () => {
        durInput.value = String(s);
        this.durationValue = s;
      });
    }

    const fetchBtn = cardUrl.createEl("button", {
      cls: "ytec-btn ytec-btn-primary",
      text: "Fetch Video Info →",
    });
    fetchBtn.setAttribute("style", "margin-top: 10px; width: 100%;");

    // ── CARD 2: Quality & Format (1:1 Component Card) ──────────────────
    const cardQuality = cardGrid.createDiv({ cls: "ytec-card" });
    cardQuality.dataset.cardId = "quality";

    const headerQuality = cardQuality.createDiv({ cls: "ytec-card-header" });
    headerQuality.createDiv({ cls: "ytec-card-title", text: "⚙️ 2. Quality & Frame Rate" });
    headerQuality.createDiv({ cls: "ytec-card-badge", text: "Format" });

    const settingsGrid = cardQuality.createDiv({ cls: "ytec-settings-grid" });

    const qGroup = settingsGrid.createDiv({ cls: "ytec-field-group" });
    qGroup.createEl("label", { cls: "ytec-label", text: "Quality" });
    const qSelect = qGroup.createEl("select", { cls: "ytec-input" }) as HTMLSelectElement;
    const qOpts: { val: VideoQuality; label: string }[] = [
      { val: "best",  label: "Best Available (1080p+)" },
      { val: "720p",  label: "720p HD" },
      { val: "480p",  label: "480p SD" },
      { val: "360p",  label: "360p Low" },
      { val: "audio", label: "Audio Only (m4a/mp3)" },
    ];
    qOpts.forEach(o => {
      const opt = qSelect.createEl("option", { value: o.val, text: o.label });
      if (o.val === this.selectedQuality) opt.selected = true;
    });
    qSelect.addEventListener("change", () => {
      this.selectedQuality = qSelect.value as VideoQuality;
    });

    const fpsGroup = settingsGrid.createDiv({ cls: "ytec-field-group" });
    fpsGroup.createEl("label", { cls: "ytec-label", text: "Frame Rate (FPS)" });
    const fpsSelect = fpsGroup.createEl("select", { cls: "ytec-input" }) as HTMLSelectElement;
    const fpsOpts: { val: VideoFps; label: string }[] = [
      { val: "auto", label: "Auto / Best (60fps)" },
      { val: "30",   label: "Cap at 30 fps" },
    ];
    fpsOpts.forEach(o => {
      const opt = fpsSelect.createEl("option", { value: o.val, text: o.label });
      if (o.val === this.selectedFps) opt.selected = true;
    });
    fpsSelect.addEventListener("change", () => {
      this.selectedFps = fpsSelect.value as VideoFps;
    });

    // ── CARD 3: Clip Time Range & Duration (1:1 Component Card) ────────
    const cardRange = cardGrid.createDiv({ cls: "ytec-card" });
    cardRange.dataset.cardId = "range";

    const headerRange = cardRange.createDiv({ cls: "ytec-card-header" });
    headerRange.createDiv({ cls: "ytec-card-title", text: "✂️ 3. Clip Duration & Time Range" });
    headerRange.createDiv({ cls: "ytec-card-badge", text: "Range" });

    const maxDur = this.preview ? this.preview.video_duration : 3600;
    const rangeHeaderRow = cardRange.createDiv({ cls: "ytec-range-header" });
    const rangeInfoEl = rangeHeaderRow.createDiv({ cls: "ytec-range-info" });

    const fullDurBtn = rangeHeaderRow.createEl("button", {
      cls: "ytec-preset-btn ytec-full-dur-btn",
      text: `⚡ Full Video (${formatTime(maxDur)})`,
    });

    const sliderGroup = cardRange.createDiv({ cls: "ytec-slider-group" });
    sliderGroup.setAttribute("style", "margin-top: 8px;");

    sliderGroup.createEl("label", { cls: "ytec-hint", text: "Start Time:" });
    const startSlider = sliderGroup.createEl("input", {
      cls: "ytec-range-slider",
      type: "range",
      attr: { min: "0", max: String(maxDur), step: "1" },
    }) as HTMLInputElement;
    startSlider.value = String(this.editedStart);

    sliderGroup.createEl("label", { cls: "ytec-hint", text: "End Time:" });
    const endSlider = sliderGroup.createEl("input", {
      cls: "ytec-range-slider",
      type: "range",
      attr: { min: "0", max: String(maxDur), step: "1" },
    }) as HTMLInputElement;
    endSlider.value = String(this.editedEnd);

    const updateRangeUI = () => {
      let st = parseInt(startSlider.value, 10) || 0;
      let en = parseInt(endSlider.value, 10) || maxDur;

      if (st >= en) st = Math.max(0, en - 1);
      if (en <= st) en = Math.min(maxDur, st + 1);

      this.editedStart = st;
      this.editedEnd = en;

      const dur = en - st;
      rangeInfoEl.textContent = `Range: ${formatTime(st)} ──▶ ${formatTime(en)}  (${dur}s total)`;
    };

    updateRangeUI();

    startSlider.addEventListener("input", updateRangeUI);
    endSlider.addEventListener("input", updateRangeUI);

    fullDurBtn.addEventListener("click", () => {
      startSlider.value = "0";
      endSlider.value = String(maxDur);
      updateRangeUI();
    });

    // ── CARD 4: Embedded Video Preview & Action (1:1 Component Card) ────
    const cardPreview = cardGrid.createDiv({ cls: "ytec-card" });
    cardPreview.dataset.cardId = "preview";

    const headerPreview = cardPreview.createDiv({ cls: "ytec-card-header" });
    headerPreview.createDiv({ cls: "ytec-card-title", text: "📺 4. Embedded Video Preview & Action" });
    headerPreview.createDiv({ cls: "ytec-card-badge", text: "Preview" });

    if (this.preview) {
      const p = this.preview;
      const playerBox = cardPreview.createDiv({ cls: "ytec-player-box" });
      const embedUrl = `https://www.youtube.com/embed/${p.video_id}?autoplay=0&start=${this.editedStart}`;
      playerBox.createEl("iframe", {
        cls: "ytec-video-iframe",
        attr: {
          src: embedUrl,
          title: p.title,
          frameborder: "0",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
        },
      });

      const meta = cardPreview.createDiv({ cls: "ytec-meta" });
      meta.createEl("div", { cls: "ytec-video-title", text: p.title });
      meta.createEl("div", { cls: "ytec-channel", text: p.channel });

      const badges = cardPreview.createDiv({ cls: "ytec-badges" });
      badges.setAttribute("style", "margin-top: 6px;");
      badges.createEl("span", {
        cls: p.has_transcript
          ? "ytec-badge ytec-badge-ok"
          : "ytec-badge ytec-badge-warn",
        text: p.has_transcript ? "✓ Subtitles Available" : "⚠ No Subtitles",
      });
    } else {
      cardPreview.createDiv({
        cls: "ytec-hint",
        text: "Enter a URL and click 'Fetch Video Info' above to load the live video preview player.",
      });
    }

    const captureBtn = cardPreview.createEl("button", {
      cls: "ytec-btn ytec-btn-primary",
      text: "⚡ Start Capture & Generate Zip →",
    });
    captureBtn.setAttribute("style", "margin-top: 12px; width: 100%;");

    const errorEl = contentEl.createDiv({ cls: "ytec-error ytec-hidden" });
    const showError = (msg: string) => {
      errorEl.textContent = msg;
      errorEl.removeClass("ytec-hidden");
    };

    // ── Highlighting logic for 1:1 Component Cards ─────────────────────
    const allCards = [cardUrl, cardQuality, cardRange, cardPreview];

    const setActiveCard = (targetId: CardId) => {
      this.activeCardId = targetId;
      allCards.forEach((c) => {
        if (c.dataset.cardId === targetId) {
          c.addClass("is-active");
          c.removeClass("is-muted");
        } else {
          c.removeClass("is-active");
          c.addClass("is-muted");
        }
      });
    };

    allCards.forEach((c) => {
      c.addEventListener("click", () => {
        const id = c.dataset.cardId as CardId;
        if (id) setActiveCard(id);
      });
    });

    // Set initial card state
    setActiveCard(this.activeCardId);

    // Button event handlers
    fetchBtn.addEventListener("click", async () => {
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
      this.activeCardId = "preview";

      await this.goToPreview();
    });

    captureBtn.addEventListener("click", async () => {
      if (!this.preview) {
        const url = urlInput.value.trim();
        if (!url) { showError("Please enter a YouTube URL first."); return; }
        this.urlValue = url;
        this.durationValue = parseInt(durInput.value, 10) || 10;
        await this.goToPreview();
        if (!this.preview) return;
      }

      this.preview.start = this.editedStart;
      this.preview.end = this.editedEnd;
      this.preview.duration = this.editedEnd - this.editedStart;
      this.preview.quality = this.selectedQuality;
      this.preview.fps = this.selectedFps;

      await this.doCapture();
    });
  }

  private async goToPreview(): Promise<void> {
    this.step = "processing";
    this.render();
    this.setStatus("Fetching video info via yt-dlp…");
    this.addLog("Running: yt-dlp --dump-json --skip-download");

    try {
      const parsed = parseYouTubeUrl(this.urlValue)!;
      const targetUrl = buildYouTubeUrl(parsed.videoId);
      const info = await fetchVideoInfo(targetUrl, this.plugin.settings);
      this.addLog(`✓ Got info: "${info.title}"`);

      const start = parsed.startSeconds;
      const videoDur = info.duration || 300;
      const end = Math.min(videoDur, start + this.durationValue);

      this.editedStart = start;
      this.editedEnd = end;

      const hasSubs =
        info.subtitles && Object.keys(info.subtitles).length > 0;
      const hasAutoCaps =
        info.automatic_captions && Object.keys(info.automatic_captions).length > 0;

      this.preview = {
        video_id: info.id,
        title: info.title,
        channel: info.channel || info.uploader || "Unknown",
        channel_url: info.channel_url || info.uploader_url || "",
        thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[info.thumbnails.length - 1].url : ""),
        start,
        end,
        duration: end - start,
        has_transcript: Boolean(hasSubs || hasAutoCaps),
        video_duration: videoDur,
        upload_date: info.upload_date || "",
        view_count: info.view_count || 0,
        tags: info.tags ?? [],
        description: info.description ?? "",
        quality: this.selectedQuality,
        fps: this.selectedFps,
      };

      this.step = "input";
      this.activeCardId = "preview";
      this.render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Preview failed: ${msg}`, 10_000);
      this.step = "input";
      this.render();
    }
  }

  private async doCapture(): Promise<void> {
    if (!this.preview) return;
    const p = this.preview;

    this.step = "processing";
    this.render();

    this.currentTaskId = `task_${Date.now()}`;
    const tempDir = path.join(os.tmpdir(), `ytec_${Date.now()}`);

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      this.setStatus("Downloading clip…");
      this.addLog("Starting yt-dlp clip download…");

      const targetUrl = buildYouTubeUrl(p.video_id);
      const clipOutPath = path.join(tempDir, "clip.mp4");

      await downloadClip(
        targetUrl,
        p.start,
        p.end,
        clipOutPath,
        this.plugin.settings,
        p.quality,
        p.fps,
        (msg) => {
          const line = msg.trim();
          if (line) {
            const prog = parseYtDlpProgress(line);
            if (prog) {
              this.updateProgressBar(prog);
              if (this.currentTaskId) {
                this.bgManager.updateTaskProgress(this.currentTaskId, prog.percent, prog);
              }
            } else if (line.includes("[download]") || line.includes("[ffmpeg]")) {
              this.addLog(line.substring(0, 120));
            }
          }
        }
      );

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

      this.setStatus("Downloading thumbnail…");
      const thumbArrayBuffer = await downloadThumbnail(p.thumbnail);
      const thumbBuffer = Buffer.from(thumbArrayBuffer);
      this.addLog("✓ Thumbnail downloaded");

      this.setStatus("Fetching transcript…");
      let transcriptEntries: TranscriptEntry[] = [];

      if (p.has_transcript) {
        try {
          await downloadSubtitles(targetUrl, tempDir, this.plugin.settings);
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

      const notesContent = buildNotesMarkdown({
        title: p.title,
        url: targetUrl,
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

      this.setStatus("Creating zip archive…");
      const zipBuffer = await buildZip({
        clipPath: actualClipPath,
        thumbData: thumbBuffer,
        notesContent,
      });
      this.addLog("✓ Zip archive created");

      this.setStatus("Saving to vault…");
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const safeTitle = sanitizeFilename(p.title);
      const filename = `${safeTitle}_${dateStr}.zip`;
      const outputFolder = this.plugin.settings.ytCaptureOutputFolder || "YT Captures";
      const vaultFilePath = `${outputFolder}/${filename}`;

      try {
        await this.app.vault.createFolder(outputFolder);
      } catch {
        // Folder exists
      }

      const existing = this.app.vault.getAbstractFileByPath(vaultFilePath);
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

      const adapter = this.app.vault.adapter as FileSystemAdapter;
      const fsDirPath = path.join(adapter.getBasePath(), outputFolder);

      this.result = { filename, vaultPath: vaultFilePath, fsDirPath };

      if (this.currentTaskId) {
        this.bgManager.completeTask(this.currentTaskId, p.title, vaultFilePath);
      }

      this.step = "done";
      this.render();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`✗ Error: ${msg}`);
      if (this.currentTaskId) {
        this.bgManager.failTask(this.currentTaskId, msg);
      } else {
        new Notice(`Capture failed: ${msg}`, 12_000);
      }
      this.step = "input";
      this.render();
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private renderProcessing(): void {
    const { contentEl } = this;
    const p = this.preview;

    const wrap = contentEl.createDiv({ cls: "ytec-processing" });

    // Live Video Player so user can play & watch while downloading!
    if (p) {
      const playerBox = wrap.createDiv({ cls: "ytec-player-box ytec-player-box-sm" });
      const embedUrl = `https://www.youtube.com/embed/${p.video_id}?autoplay=1&start=${p.start}`;
      playerBox.createEl("iframe", {
        cls: "ytec-video-iframe",
        attr: {
          src: embedUrl,
          title: p.title,
          frameborder: "0",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
        },
      });
    }

    // Status Title
    this.statusEl = wrap.createEl("p", {
      cls: "ytec-status-text",
      text: "Downloading clip…",
    });

    // Visual Progress Bar Container
    const progressTrack = wrap.createDiv({ cls: "ytec-progress-track" });
    this.progressBarEl = progressTrack.createDiv({ cls: "ytec-progress-fill" });
    this.progressBarEl.style.width = "0%";

    // Stats Info Label
    this.progressStatsEl = wrap.createDiv({
      cls: "ytec-progress-stats",
      text: "0% (Connecting…)",
    });

    // Background Download Action Button
    const bgActionRow = wrap.createDiv({ cls: "ytec-actions ytec-actions-row" });
    const bgBtn = bgActionRow.createEl("button", {
      cls: "ytec-btn ytec-btn-secondary ytec-btn-full",
      text: "⚡ Send to Background (Play/Use Obsidian)",
    });

    bgBtn.addEventListener("click", () => {
      if (this.preview && !this.currentTaskId) {
        this.currentTaskId = `task_${Date.now()}`;
        this.bgManager.addTask({
          id: this.currentTaskId,
          title: this.preview.title,
          progress: 0,
          statusText: "Downloading…",
        });
      }
      this.close();
    });

    this.logEl = contentEl.createDiv({ cls: "ytec-log" });
  }

  private setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private updateProgressBar(info: ProgressInfo): void {
    if (this.progressBarEl) {
      this.progressBarEl.style.width = `${info.percent}%`;
    }
    if (this.progressStatsEl) {
      const stats = [
        `${info.percent.toFixed(1)}%`,
        info.total ? `of ${info.total}` : "",
        info.speed ? `@ ${info.speed}` : "",
        info.eta ? `ETA: ${info.eta}` : "",
      ].filter(Boolean).join(" | ");
      this.progressStatsEl.textContent = stats;
    }
  }

  private addLog(msg: string): void {
    if (!this.logEl) return;
    this.logEl.createEl("div", { cls: "ytec-log-entry", text: msg });
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

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

    if (this.result) {
      const revealBtn = actions.createEl("button", {
        cls: "ytec-btn ytec-btn-secondary",
        text: "📂 Show in File Explorer",
      });
      revealBtn.addEventListener("click", () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
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
      this.activeCardId = "url";
      this.render();
    });

    const closeBtn = actions.createEl("button", {
      cls: "ytec-btn ytec-btn-ghost",
      text: "Close",
    });
    closeBtn.addEventListener("click", () => this.close());
  }
}
