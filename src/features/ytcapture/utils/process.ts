/**
 * Cross-platform process runner for CLI tools (yt-dlp, ffmpeg).
 * On Windows: uses exec with shell (handles PATH resolution and .exe extension).
 * On Unix: uses spawn without shell (safer, no injection risk).
 */
import { exec, spawn } from "child_process";

export interface RunOptions {
  cwd?: string;
  maxBuffer?: number;
  onStderr?: (data: string) => void;
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
  return new Promise((resolve, reject) => {
    const maxBuffer = opts.maxBuffer ?? 100 * 1024 * 1024;

    if (process.platform === "win32") {
      const quote = (s: string) =>
        s.includes(" ") || s.includes('"')
          ? `"${s.replace(/"/g, '\\"')}"`
          : s;
      const cmd = [quote(command), ...args.map(quote)].join(" ");

      const proc = exec(cmd, { cwd: opts.cwd, maxBuffer });
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
            `Could not start "${command}": ${err.message}\n` +
              `Make sure it is installed and the path is correct in plugin settings.`
          )
        )
      );
      proc.on("close", (code) => {
        if (code === 0 || code === null) resolve(stdout);
        else reject(new Error(stderr.trim() || `"${command}" exited with code ${code}`));
      });
    } else {
      const child = spawn(command, args, { cwd: opts.cwd });
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
            `Could not start "${command}": ${err.message}\n` +
              `Make sure it is installed and the path is correct in plugin settings.`
          )
        )
      );
      child.on("close", (code) => {
        if (code === 0 || code === null) resolve(stdout);
        else reject(new Error(stderr.trim() || `"${command}" exited with code ${code}`));
      });
    }
  });
}
