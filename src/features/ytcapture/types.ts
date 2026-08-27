/** YT Extension — shared types (inside PakCLI Suite) */

export type VideoQuality =
  | "best"
  | "4k"
  | "2k"
  | "1080p"
  | "720p"
  | "480p"
  | "360p"
  | "240p"
  | "144p"
  | "audio";
export type VideoFps = "auto" | "60" | "30";

export interface YTPreset {
  id: string;
  name: string;
  lastUsedAt: number;
  frontmatterKeys?: {
    titleKey?: string;
    urlKey?: string;
    channelKey?: string;
    uploadDateKey?: string;
    thumbnailKey?: string;
    timeRangeKey?: string;
    descriptionKey?: string;
  };
}

export const DEFAULT_PRESETS: YTPreset[] = [
  {
    id: "yt_evidence_standard",
    name: "YT Evidence (yt_title, yt_url, yt_channel, yt_upload_date, yt_thumbnail, capture_time_range, yt_description)",
    lastUsedAt: Date.now(),
    frontmatterKeys: {
      titleKey: "yt_title",
      urlKey: "yt_url",
      channelKey: "yt_channel",
      uploadDateKey: "yt_upload_date",
      thumbnailKey: "yt_thumbnail",
      timeRangeKey: "capture_time_range",
      descriptionKey: "yt_description",
    },
  },
  {
    id: "yt_minimal",
    name: "Minimal (title, url, channel, time_range, description)",
    lastUsedAt: Date.now() - 1000,
    frontmatterKeys: {
      titleKey: "title",
      urlKey: "url",
      channelKey: "channel",
      uploadDateKey: "upload_date",
      thumbnailKey: "thumbnail",
      timeRangeKey: "time_range",
      descriptionKey: "description",
    },
  },
  {
    id: "yt_raw_meta",
    name: "Full Raw Metadata (yt_title, yt_url, etc.)",
    lastUsedAt: Date.now() - 2000,
    frontmatterKeys: {
      titleKey: "yt_title",
      urlKey: "yt_url",
      channelKey: "yt_channel",
      uploadDateKey: "yt_upload_date",
      thumbnailKey: "yt_thumbnail",
      timeRangeKey: "capture_time_range",
      descriptionKey: "yt_description",
    },
  },
];

import type { YTHistoryCache } from "./utils/historyCache";

export interface YTCaptureSettings {
  ytDlpPath: string;
  ffmpegPath: string;
  ytCaptureOutputFolder: string;
  ytCaptureDefaultDuration: number;
  ytCaptureQuality?: VideoQuality;
  ytCaptureFps?: VideoFps;
  ytCaptureCreateZip?: boolean;
  presets?: YTPreset[];
  activePresetId?: string;
  ytHistoryCache?: YTHistoryCache;
}

export const DEFAULT_YTCAPTURE_SETTINGS: YTCaptureSettings = {
  ytDlpPath: "yt-dlp",
  ffmpegPath: "ffmpeg",
  ytCaptureOutputFolder: "YT Captures",
  ytCaptureDefaultDuration: 10,
  ytCaptureQuality: "best",
  ytCaptureFps: "auto",
  ytCaptureCreateZip: false,
  presets: DEFAULT_PRESETS,
  activePresetId: "yt_evidence_standard",
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
  is_live?: boolean;
  was_live?: boolean;
  live_status?: string;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}

// ── Preview state (across modal steps) ───────────────────────────────────────

export interface VideoPreview {
  video_id: string;
  original_url: string;
  platform: "youtube" | "instagram";
  title: string;
  channel: string;
  channel_url: string;
  thumbnail: string;
  start: number;
  end: number;
  duration: number;
  has_transcript: boolean;
  is_live?: boolean;
  was_live?: boolean;
  live_status?: string;
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
