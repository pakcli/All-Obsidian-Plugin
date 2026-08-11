/**
 * Direct HTTP Downloader for yt-dlp.exe and binary setup fallback.
 * Downloads binaries directly into plugin directory if Winget or PATH fails.
 */
import { FileSystemAdapter, requestUrl } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import type PakCLIPlugin from "../../../main";
import { runCommand, resolveBinary, ensureWinGetInPath } from "./process";

export interface DownloadProgress {
  (message: string): void;
}

/**
 * Get plugin bin folder: <Vault>/.obsidian/plugins/master/bin
 */
export function getPluginBinDir(plugin: PakCLIPlugin): string {
  const adapter = plugin.app.vault.adapter;
  let pluginDir = "";
  if (adapter instanceof FileSystemAdapter) {
    pluginDir = path.join(adapter.getBasePath(), plugin.manifest.dir || ".obsidian/plugins/master");
  } else {
    pluginDir = path.join(process.cwd(), "bin");
  }
  const binDir = path.join(pluginDir, "bin");
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }
  return binDir;
}

/**
 * Download yt-dlp.exe directly from official GitHub release
 */
export async function downloadYtDlpDirect(
  plugin: PakCLIPlugin,
  onProgress?: DownloadProgress
): Promise<string> {
  const binDir = getPluginBinDir(plugin);
  const targetExe = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

  onProgress?.("Downloading latest yt-dlp from GitHub releases…");

  const downloadUrl = process.platform === "win32"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  const res = await requestUrl({
    url: downloadUrl,
    method: "GET",
  });

  if (res.status !== 200 || !res.arrayBuffer) {
    throw new Error(`Failed to download yt-dlp (HTTP ${res.status})`);
  }

  const buffer = Buffer.from(res.arrayBuffer);
  fs.writeFileSync(targetExe, buffer);

  if (process.platform !== "win32") {
    try {
      fs.chmodSync(targetExe, 0o755);
    } catch {
      // Ignore chmod errors on Windows
    }
  }

  onProgress?.(`✓ Saved yt-dlp to: ${targetExe}`);

  // Automatically update plugin settings path
  plugin.settings.ytDlpPath = targetExe;
  await plugin.saveSettings();

  return targetExe;
}

/**
 * Ensure yt-dlp is available — tries PATH/winget first, falls back to direct download
 */
export async function ensureYtDlpAvailable(
  plugin: PakCLIPlugin,
  onProgress?: DownloadProgress
): Promise<boolean> {
  ensureWinGetInPath();

  // 1. Try currently configured or resolved command
  try {
    const v = await runCommand(plugin.settings.ytDlpPath, ["--version"]);
    onProgress?.(`✓ yt-dlp is ready (${v.trim()})`);
    return true;
  } catch {
    // Not working yet
  }

  // 2. Try default 'yt-dlp'
  try {
    const v = await runCommand("yt-dlp", ["--version"]);
    plugin.settings.ytDlpPath = "yt-dlp";
    await plugin.saveSettings();
    onProgress?.(`✓ yt-dlp is ready on system PATH (${v.trim()})`);
    return true;
  } catch {
    // Not in PATH
  }

  // 3. Direct Download Fallback
  try {
    const targetExe = await downloadYtDlpDirect(plugin, onProgress);
    const v = await runCommand(targetExe, ["--version"]);
    onProgress?.(`✓ Direct downloaded yt-dlp verified (${v.trim()})`);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.(`✗ Direct download failed: ${msg}`);
    return false;
  }
}
