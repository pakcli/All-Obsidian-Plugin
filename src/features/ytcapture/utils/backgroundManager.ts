/**
 * Background Download & Status Bar Manager for YT Extension.
 * Allows downloads to continue running in background while user plays video or uses Obsidian.
 */
import { Notice } from "obsidian";
import type PakCLIPlugin from "../../../main";
import type { ProgressInfo } from "../types";

export interface BackgroundTask {
  id: string;
  title: string;
  progress: number;
  statusText: string;
  cancel?: () => void;
}

export class YTCaptureBackgroundManager {
  private plugin: PakCLIPlugin;
  private statusBarItem: HTMLElement | null = null;
  private activeTasks: Map<string, BackgroundTask> = new Map();

  constructor(plugin: PakCLIPlugin) {
    this.plugin = plugin;
  }

  public init(): void {
    if (!this.statusBarItem) {
      this.statusBarItem = this.plugin.addStatusBarItem();
      this.statusBarItem.addClass("ytec-status-bar-item");
      this.statusBarItem.hide();
    }
  }

  public addTask(task: BackgroundTask): void {
    this.init();
    this.activeTasks.set(task.id, task);
    this.updateStatusBar();
    new Notice(`🎬 YT Extension: Download started in background ("${task.title}")`);
  }

  public updateTaskProgress(id: string, progress: number, progressInfo?: ProgressInfo): void {
    const task = this.activeTasks.get(id);
    if (!task) return;
    task.progress = progress;
    if (progressInfo) {
      task.statusText = `${progressInfo.percent.toFixed(0)}% | ${progressInfo.speed || "dl"} | ETA: ${progressInfo.eta || "..."}`;
    }
    this.updateStatusBar();
  }

  public completeTask(id: string, title: string, vaultPath: string): void {
    this.activeTasks.delete(id);
    this.updateStatusBar();
    new Notice(`✅ YT Extension Captured!\nFile saved to: ${vaultPath}`, 8000);
  }

  public failTask(id: string, errorMsg: string): void {
    this.activeTasks.delete(id);
    this.updateStatusBar();
    new Notice(`✗ YT Extension Capture Failed:\n${errorMsg}`, 10_000);
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;

    if (this.activeTasks.size === 0) {
      this.statusBarItem.hide();
      return;
    }

    this.statusBarItem.show();
    const tasksArr = Array.from(this.activeTasks.values());
    const first = tasksArr[0];

    if (tasksArr.length === 1) {
      this.statusBarItem.textContent = `🎬 YT Downloading: ${first.statusText || `${first.progress}%`}`;
    } else {
      this.statusBarItem.textContent = `🎬 YT Downloading (${tasksArr.length} tasks)`;
    }
  }
}
