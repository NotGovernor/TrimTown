import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canTrim,
  isPlaying,
  previewAudioReady,
  replaceClip,
  setFfmpegMissing,
  setIsEncoding,
  setIsPlaying,
  setPlayhead,
  setInFromPlayhead,
  setOutFromPlayhead,
  setClip,
  setInFrame,
  setOutFrame,
  setPreviewAudioReady,
  setSettingsOpen,
  setStillUrl,
  settingsOpen,
  showToast,
  stillUrl,
  toast,
} from "./appStore";
import type { ClipMeta } from "../types";

function sampleClip(overrides: Partial<ClipMeta> = {}): ClipMeta {
  return {
    path: "/tmp/clip.mp4",
    duration: 10,
    fps: 24,
    frame_count: 240,
    width: 1920,
    height: 1080,
    codec_name: "h264",
    pix_fmt: "yuv420p",
    color_transfer: "bt709",
    ten_bit: false,
    hdr: false,
    has_video: true,
    ...overrides,
  };
}

describe("settingsOpen", () => {
  it("defaults false", () => {
    setSettingsOpen(false);
    expect(settingsOpen()).toBe(false);
  });
});

describe("canTrim", () => {
  beforeEach(() => {
    setClip(null);
    setInFrame(0);
    setOutFrame(0);
    setPlayhead(0);
    setFfmpegMissing(false);
    setIsEncoding(false);
  });

  it("is false if no clip", () => {
    expect(canTrim()).toBe(false);
  });

  it("is false if out <= in", () => {
    replaceClip(sampleClip());
    setPlayhead(50);
    setInFromPlayhead();
    setPlayhead(10);
    setOutFromPlayhead();
    expect(canTrim()).toBe(false);
  });

  it("is false if ffmpeg missing", () => {
    replaceClip(sampleClip());
    setFfmpegMissing(true);
    expect(canTrim()).toBe(false);
  });

  it("is false if encoding", () => {
    replaceClip(sampleClip());
    setIsEncoding(true);
    expect(canTrim()).toBe(false);
  });

  it("is true otherwise", () => {
    replaceClip(sampleClip());
    expect(canTrim()).toBe(true);
  });
});

describe("replaceClip", () => {
  it("clears stillUrl", () => {
    setStillUrl("blob:old-still");
    replaceClip(sampleClip());
    expect(stillUrl()).toBe(null);
  });

  it("halts playback and clears previewAudioReady", () => {
    setIsPlaying(true);
    setPreviewAudioReady(true);
    replaceClip(sampleClip());
    expect(isPlaying()).toBe(false);
    expect(previewAudioReady()).toBe(false);
  });
});

describe("showToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    showToast(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps error toasts until cleared", () => {
    showToast("Cancelled");
    vi.advanceTimersByTime(10_000);
    expect(toast()).toBe("Cancelled");
  });

  it("clears non-persist toasts after 4s", () => {
    showToast("Trim complete", false);
    expect(toast()).toBe("Trim complete");
    vi.advanceTimersByTime(3999);
    expect(toast()).toBe("Trim complete");
    vi.advanceTimersByTime(1);
    expect(toast()).toBeNull();
  });

  it("cancels the previous timer when a new toast arrives", () => {
    showToast("Trim complete", false);
    vi.advanceTimersByTime(2000);
    showToast("Cancelled");
    vi.advanceTimersByTime(10_000);
    expect(toast()).toBe("Cancelled");
  });

  it("clears immediately when showToast(null)", () => {
    showToast("Cancelled");
    showToast(null);
    expect(toast()).toBeNull();
  });
});
