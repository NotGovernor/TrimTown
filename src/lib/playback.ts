import {
  clip,
  html5Playable,
  isPlaying,
  playhead,
  setHtml5Playable,
  setIsPlaying,
  setInFromPlayhead,
  setOutFromPlayhead,
  setPlayhead,
} from "../stores/appStore";
import { frameToSeconds, secondsToFrame } from "./frame";
import { requestStill } from "./still";

let videoEl: HTMLVideoElement | null = null;

function requestStillIfNeeded(path: string, frame: number, fps: number, debounceMs: number): void {
  if (html5Playable()) return;
  void requestStill(path, frame, fps, debounceMs);
}

export function registerVideo(el: HTMLVideoElement | undefined): void {
  videoEl = el ?? null;
}

export function onVideoTimeUpdate(): void {
  const c = clip();
  const el = videoEl;
  if (!c || !el || !isPlaying()) return;
  setPlayhead(secondsToFrame(el.currentTime, c.fps, c.frame_count));
}

export function onVideoEnded(): void {
  void pausePlayback();
}

export async function togglePlayback(): Promise<void> {
  if (isPlaying()) {
    await pausePlayback();
    return;
  }
  await playPlayback();
}

export async function playPlayback(): Promise<void> {
  const c = clip();
  if (!c || !html5Playable()) return;
  const el = videoEl;
  if (!el) return;
  try {
    el.currentTime = frameToSeconds(playhead(), c.fps);
    await el.play();
    setIsPlaying(true);
  } catch {
    setHtml5Playable(false);
    setIsPlaying(false);
  }
}

/** Pause HTML5 playback without snapping or fetching a still (timeline scrub). */
export function haltPlayback(): void {
  videoEl?.pause();
  setIsPlaying(false);
}

export async function pausePlayback(): Promise<void> {
  const c = clip();
  const el = videoEl;
  haltPlayback();
  if (!c) return;
  const frame = el ? secondsToFrame(el.currentTime, c.fps, c.frame_count) : playhead();
  setPlayhead(frame);
  requestStillIfNeeded(c.path, frame, c.fps, 0);
}

export function stepFrame(delta: number): void {
  const c = clip();
  if (!c) return;
  if (isPlaying()) {
    videoEl?.pause();
    setIsPlaying(false);
  }
  const max = Math.max(0, c.frame_count - 1);
  const next = Math.min(Math.max(playhead() + delta, 0), max);
  setPlayhead(next);
  if (videoEl) videoEl.currentTime = frameToSeconds(next, c.fps);
  requestStillIfNeeded(c.path, next, c.fps, 0);
}

export function markIn(): void {
  const c = clip();
  if (!c) return;
  setInFromPlayhead();
}

export function markOut(): void {
  const c = clip();
  if (!c) return;
  setOutFromPlayhead();
}

export function seekPlayhead(frame: number, debounceMs: number): void {
  const c = clip();
  if (!c) return;
  const max = Math.max(0, c.frame_count - 1);
  const next = Math.min(Math.max(Math.round(frame), 0), max);
  setPlayhead(next);
  if (videoEl && !isPlaying()) videoEl.currentTime = frameToSeconds(next, c.fps);
  requestStillIfNeeded(c.path, next, c.fps, debounceMs);
}
