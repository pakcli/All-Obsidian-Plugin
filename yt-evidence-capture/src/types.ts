// Shared TypeScript interfaces for YT Evidence Capture

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
}

export interface TranscriptEntry {
  start: number;    // seconds
  duration: number; // seconds
  text: string;
}

export interface CaptureResult {
  filename: string;
  vaultPath: string;  // vault-relative path
  fsDirPath: string;  // absolute filesystem directory
}

/** Shape of yt-dlp --dump-json output (subset of fields we use) */
export interface YtDlpInfo {
  id: string;
  title: string;
  uploader: string;
  uploader_url: string;
  channel: string;
  channel_id: string;
  channel_url: string;
  thumbnail: string;
  duration: number;
  upload_date: string;
  view_count: number;
  tags: string[];
  description: string;
  subtitles: Record<string, unknown[]>;
  automatic_captions: Record<string, unknown[]>;
}
