import { GridBuffer } from './GridBuffer';

export type AnimationTickCallback = (currentFrameIndex: number, buffer: GridBuffer) => void;

export class AnimationEngine {
	public frames: GridBuffer[] = [];
	public currentFrameIndex = 0;
	public fps = 8;
	public isPlaying = false;
	public loop = true;
	public onionSkinning = false;

	private animationFrameId: number | null = null;
	private lastTickTime = 0;
	private onTickCallbacks: AnimationTickCallback[] = [];

	constructor(cols = 60, rows = 20, initialFrameText?: string) {
		const firstFrame = new GridBuffer(cols, rows);
		if (initialFrameText) {
			firstFrame.fromString(initialFrameText);
		}
		this.frames.push(firstFrame);
	}

	public getCurrentFrame(): GridBuffer {
		if (this.frames.length === 0) {
			this.frames.push(new GridBuffer(60, 20));
		}
		return this.frames[this.currentFrameIndex] || this.frames[0];
	}

	public setFrame(index: number): void {
		if (index >= 0 && index < this.frames.length) {
			this.currentFrameIndex = index;
			this.notifyTick();
		}
	}

	public addFrame(afterIndex?: number): number {
		const cur = this.getCurrentFrame();
		const newFrame = new GridBuffer(cur.cols, cur.rows);
		const targetIndex = afterIndex !== undefined ? afterIndex + 1 : this.frames.length;
		this.frames.splice(targetIndex, 0, newFrame);
		this.currentFrameIndex = targetIndex;
		this.notifyTick();
		return targetIndex;
	}

	public duplicateFrame(index?: number): number {
		const targetIdx = index !== undefined ? index : this.currentFrameIndex;
		const source = this.frames[targetIdx] || this.getCurrentFrame();
		const copy = source.clone();
		const newIndex = targetIdx + 1;
		this.frames.splice(newIndex, 0, copy);
		this.currentFrameIndex = newIndex;
		this.notifyTick();
		return newIndex;
	}

	public deleteFrame(index?: number): void {
		if (this.frames.length <= 1) {
			// Don't delete the only frame, just clear it
			this.getCurrentFrame().clear();
			this.notifyTick();
			return;
		}

		const targetIdx = index !== undefined ? index : this.currentFrameIndex;
		this.frames.splice(targetIdx, 1);
		if (this.currentFrameIndex >= this.frames.length) {
			this.currentFrameIndex = this.frames.length - 1;
		}
		this.notifyTick();
	}

	public moveFrame(fromIndex: number, toIndex: number): void {
		if (fromIndex < 0 || fromIndex >= this.frames.length) return;
		if (toIndex < 0 || toIndex >= this.frames.length) return;

		const [moved] = this.frames.splice(fromIndex, 1);
		this.frames.splice(toIndex, 0, moved);
		this.currentFrameIndex = toIndex;
		this.notifyTick();
	}

	public resizeAllFrames(newCols: number, newRows: number): void {
		for (const frame of this.frames) {
			frame.resize(newCols, newRows);
		}
		this.notifyTick();
	}

	// =========================================================================
	// Playback Controls
	// =========================================================================

	public play(): void {
		if (this.isPlaying) return;
		this.isPlaying = true;
		this.lastTickTime = performance.now();
		this.tickLoop();
	}

	public pause(): void {
		this.isPlaying = false;
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	public togglePlay(): boolean {
		if (this.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
		return this.isPlaying;
	}

	public nextFrame(): void {
		if (this.frames.length <= 1) return;
		if (this.currentFrameIndex + 1 < this.frames.length) {
			this.currentFrameIndex++;
		} else if (this.loop) {
			this.currentFrameIndex = 0;
		}
		this.notifyTick();
	}

	public prevFrame(): void {
		if (this.frames.length <= 1) return;
		if (this.currentFrameIndex > 0) {
			this.currentFrameIndex--;
		} else if (this.loop) {
			this.currentFrameIndex = this.frames.length - 1;
		}
		this.notifyTick();
	}

	private tickLoop = (): void => {
		if (!this.isPlaying) return;

		const now = performance.now();
		const interval = 1000 / Math.max(1, this.fps);
		const delta = now - this.lastTickTime;

		if (delta >= interval) {
			this.lastTickTime = now - (delta % interval);
			this.nextFrame();
		}

		this.animationFrameId = requestAnimationFrame(this.tickLoop);
	};

	public onTick(cb: AnimationTickCallback): () => void {
		this.onTickCallbacks.push(cb);
		return () => {
			this.onTickCallbacks = this.onTickCallbacks.filter(c => c !== cb);
		};
	}

	private notifyTick(): void {
		const cur = this.getCurrentFrame();
		for (const cb of this.onTickCallbacks) {
			cb(this.currentFrameIndex, cur);
		}
	}

	public destroy(): void {
		this.pause();
		this.onTickCallbacks = [];
	}
}
