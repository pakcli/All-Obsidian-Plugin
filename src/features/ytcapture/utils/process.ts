/**
 * Cross-platform process runner with smart Windows WinGet binary resolution.
 */
import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface RunOptions {
  cwd?: string;
  maxBuffer?: number;
  onStderr?: (data: string) => void;
}

/**
 * Ensure Windows WinGet Links path is included in runtime process.env.PATH
 */
export function ensureWinGetInPath(): void {
  if (process.platform !== "win32") return;
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const wingetLinks = path.join(localAppData, "Microsoft", "WinGet", "Links");

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
  if (process.platform !== "win32") return null;

  const targetName = name.toLowerCase().endsWith(".exe") ? name.toLowerCase() : `${name.toLowerCase()}.exe`;
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");

  // 1. Check WinGet Links
  const linksPath = path.join(localAppData, "Microsoft", "WinGet", "Links", targetName);
  if (fs.existsSync(linksPath)) return linksPath;

  // 2. Check WinGet Packages directory
  const packagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(packagesDir)) {
    try {
      const searchDir = (dirPath: string, depth: number): string | null => {
        if (depth > 4) return null;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
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
  if (process.platform === "win32") {
    const wingetPath = findWinGetBinary(trimmed);
    if (wingetPath) return wingetPath;
  }

  return trimmed;
}

/**
 * Run a command and collect stdout.
 * Rejects if the process exits with a non-zero code.
 */
export function runCommand(
  command: string,
  args: string[],
  opts: RunOptions = {}
): Promise<string> {
  ensureWinGetInPath();
  const resolvedCmd = resolveBinary(command);

  return new Promise((resolve, reject) => {
    const maxBuffer = opts.maxBuffer ?? 100 * 1024 * 1024;

    if (process.platform === "win32") {
      const quote = (s: string) =>
        s.includes(" ") || s.includes('"')
          ? `"${s.replace(/"/g, '\\"')}"`
          : s;
      const cmdStr = [quote(resolvedCmd), ...args.map(quote)].join(" ");

      const proc = exec(cmdStr, { cwd: opts.cwd, maxBuffer, env: process.env });
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (d) => { stdout += d; });
      proc.stderr?.on("data", (d) => {
        stderr += d;
        opts.onStderr?.(d.toString());
      });
      proc.on("error", (err) =>
        reject(
          new Error(
            `Could not start "${resolvedCmd}": ${err.message}\n` +
              `Make sure it is installed and the path is correct in plugin settings.`
          )
        )
      );
      proc.on("close", (code) => {
        if (code === 0 || code === null) resolve(stdout);
        else reject(new Error(stderr.trim() || `"${resolvedCmd}" exited with code ${code}`));
      });
    } else {
      const child = spawn(resolvedCmd, args, { cwd: opts.cwd, env: process.env });
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => {
        const s = d.toString();
        stderr += s;
        opts.onStderr?.(s);
      });
      child.on("error", (err: Error) =>
        reject(
          new Error(
            `Could not start "${resolvedCmd}": ${err.message}\n` +
              `Make sure it is installed and the path is correct in plugin settings.`
          )
        )
      );
      child.on("close", (code) => {
        if (code === 0 || code === null) resolve(stdout);
        else reject(new Error(stderr.trim() || `"${resolvedCmd}" exited with code ${code}`));
      });
    }
  });
}
