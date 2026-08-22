/**
 * Cross-platform process runner with smart Windows WinGet binary resolution.
 * Uses direct spawn (bypassing cmd.exe shell) to prevent & parameter escaping issues.
 */
import { Platform } from "obsidian";
import { PathUtils, getNodeFs, getNodeChildProcess } from "../../../utils/nodeHelpers";

export interface RunOptions {
  cwd?: string;
  maxBuffer?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onOutput?: (data: string) => void;
}

/**
 * Ensure Windows WinGet Links path is included in runtime process.env.PATH
 */
export function ensureWinGetInPath(): void {
  if (!Platform.isDesktop || typeof process === "undefined" || process.platform !== "win32") return;
  const fs = getNodeFs();
  if (!fs) return;

  const localAppData = process.env.LOCALAPPDATA || PathUtils.join(process.env.USERPROFILE || "", "AppData", "Local");
  const wingetLinks = PathUtils.join(localAppData, "Microsoft", "WinGet", "Links");

  const currentPath = process.env.PATH || "";
  if (fs.existsSync(wingetLinks) && !currentPath.toLowerCase().includes(wingetLinks.toLowerCase())) {
    process.env.PATH = `${wingetLinks};${currentPath}`;
  }
}

// Call on module load
ensureWinGetInPath();

/**
 * Helper to locate yt-dlp.exe or ffmpeg.exe in WinGet folders if not in PATH
 */
export function findWinGetBinary(name: string): string | null {
  if (!Platform.isDesktop || typeof process === "undefined" || process.platform !== "win32") return null;
  const fs = getNodeFs();
  if (!fs) return null;

  const targetName = name.toLowerCase().endsWith(".exe") ? name.toLowerCase() : `${name.toLowerCase()}.exe`;
  const localAppData = process.env.LOCALAPPDATA || PathUtils.join(process.env.USERPROFILE || "", "AppData", "Local");

  // 1. Check WinGet Links
  const linksPath = PathUtils.join(localAppData, "Microsoft", "WinGet", "Links", targetName);
  if (fs.existsSync(linksPath)) return linksPath;

  // 2. Check WinGet Packages directory
  const packagesDir = PathUtils.join(localAppData, "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(packagesDir)) {
    try {
      const searchDir = (dirPath: string, depth: number): string | null => {
        if (depth > 4) return null;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = PathUtils.join(dirPath, entry.name);
          if (entry.isFile() && entry.name.toLowerCase() === targetName) {
            return fullPath;
          } else if (entry.isDirectory()) {
            const found = searchDir(fullPath, depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const foundInPackages = searchDir(packagesDir, 1);
      if (foundInPackages) return foundInPackages;
    } catch {
      // Ignore scan errors
    }
  }

  return null;
}

/**
 * Resolve exact command to run (using setting path, system PATH, or WinGet fallback)
 */
export function resolveBinary(cmd: string): string {
  if (!cmd || cmd.trim() === "") return cmd;
  const trimmed = cmd.trim();

  // If user provided a path with slashes, use it directly
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return trimmed;
  }

  // If on Windows, check if WinGet binary fallback exists
  if (typeof process !== "undefined" && process.platform === "win32") {
    const wingetPath = findWinGetBinary(trimmed);
    if (wingetPath) return wingetPath;
  }

  return trimmed;
}

/**
 * Filter out non-fatal warning lines (e.g. yt-dlp JS runtime deprecation warnings)
 */
export function filterWarningLines(text: string): string {
  if (!text) return "";
  return text
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (l.startsWith("WARNING:")) return false;
      if (l.includes("No supported JavaScript runtime could be found")) return false;
      if (l.includes("YouTube extraction without a JS runtime has been deprecated")) return false;
      if (l.includes("See https://github.com/yt-dlp/yt-dlp/wiki/EJS")) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/**
 * Run a command and collect stdout.
 * Rejects if the process exits with a non-zero code.
 * Uses direct spawn without shell to bypass cmd.exe parameter escaping issues.
 */
export function runCommand(
  command: string,
  args: string[],
  opts: RunOptions = {}
): Promise<string> {
  if (!Platform.isDesktop) {
    return Promise.reject(new Error("Running binary processes is only supported on desktop platforms."));
  }

  const cp = getNodeChildProcess();
  if (!cp) {
    return Promise.reject(new Error("Node child_process is not available."));
  }

  ensureWinGetInPath();
  const resolvedCmd = resolveBinary(command);

  return new Promise((resolve, reject) => {
    // Direct spawn on all platforms (shell: false)
    let child = cp.spawn(resolvedCmd, args, { cwd: opts.cwd, env: typeof process !== "undefined" ? process.env : {} });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d: any) => {
      const s = d.toString();
      stdout += s;
      opts.onStdout?.(s);
      opts.onOutput?.(s);
    });
    child.stderr?.on("data", (d: any) => {
      const s = d.toString();
      stderr += s;
      opts.onStderr?.(s);
      opts.onOutput?.(s);
    });

    child.on("error", (err: Error & { code?: string }) => {
      // Fallback with shell if direct spawn fails (e.g. batch scripts)
      const isWin = typeof process !== "undefined" && process.platform === "win32";
      if (err.code === "ENOENT" && isWin) {
        const shellChild = cp.spawn(resolvedCmd, args, { cwd: opts.cwd, env: process.env, shell: true });
        let sOut = "";
        let sErr = "";
        shellChild.stdout?.on("data", (d: any) => {
          const s = d.toString();
          sOut += s;
          opts.onStdout?.(s);
          opts.onOutput?.(s);
        });
        shellChild.stderr?.on("data", (d: any) => {
          const s = d.toString();
          sErr += s;
          opts.onStderr?.(s);
          opts.onOutput?.(s);
        });
        shellChild.on("error", (e: Error) => reject(new Error(`Could not start "${resolvedCmd}": ${e.message}`)));
        shellChild.on("close", (code: number | null) => {
          if (code === 0 || code === null) {
            resolve(sOut);
          } else {
            const cleanErr = filterWarningLines(sErr);
            reject(new Error(cleanErr || `"${resolvedCmd}" exited with code ${code}`));
          }
        });
        return;
      }

      reject(
        new Error(
          `Could not start "${resolvedCmd}": ${err.message}\n` +
            `Make sure it is installed and the path is correct in plugin settings.`
        )
      );
    });

    child.on("close", (code: number | null) => {
      if (code === 0 || code === null) {
        resolve(stdout);
      } else {
        const cleanErr = filterWarningLines(stderr);
        reject(new Error(cleanErr || `"${resolvedCmd}" exited with code ${code}`));
      }
    });
  });
}
