/** YT Extension — shared types (inside PakCLI Suite) */

export type VideoQuality = "best" | "1080p" | "720p" | "480p" | "360p" | "audio";
export type VideoFps = "auto" | "60" | "30";

export interface YTCaptureSettings {
  ytDlpPath: string;
  ffmpegPath: string;
  ytCaptureOutputFolder: string;
  ytCaptureDefaultDuration: number;
  ytCaptureQuality?: VideoQuality;
  ytCaptureFps?: VideoFps;
}

export const DEFAULT_YTCAPTURE_SETTINGS: YTCaptureSettings = {
  ytDlpPath: "yt-dlp",
  ffmpegPath: "ffmpeg",
  ytCaptureOutputFolder: "YT Captures",
  ytCaptureDefaultDuration: 10,
  ytCaptureQuality: "best",
  ytCaptureFps: "auto",
};

// ── yt-dlp raw metadata shape ─────────────────────────────────────────────────

export interface YtDlpInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  channel_url?: string;
  uploader_url?: string;
  upload_date?: string;
  duration?: number;
  view_count?: number;
  description?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  tags?: string[];
  webpage_url?: string;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}

// ── Preview state (across modal steps) ───────────────────────────────────────

export interface VideoPreview {
  video_id: string;
  title: string;
  channel: string;
  channel_url: string;
  thumbnail: string;
  start: number;
  end: number;
  duration: number;
  has_transcript: boolean;
  video_duration: number;
  upload_date: string;
  view_count: number;
  tags: string[];
  description: string;
  quality: VideoQuality;
  fps: VideoFps;
}

export interface CaptureResult {
  filename: string;
  vaultPath: string;
  fsDirPath: string;
}

export interface TranscriptEntry {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ProgressInfo {
  percent: number;
  downloaded: string;
  total: string;
  speed: string;
  eta: string;
  rawMsg: string;
}
