import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  clip,
  previewAudioReady,
  replaceClip,
  setClip,
  setInFrame,
  setIsEncoding,
  setOutFrame,
  setPlayhead,
  setPreviewAudioReady,
  setToast,
  toast,
} from "../stores/appStore";
import type { ClipMeta } from "../types";
import { loadClip } from "./loadClip";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

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

describe("loadClip", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    setClip(null);
    setInFrame(0);
    setOutFrame(0);
    setPlayhead(0);
    setIsEncoding(false);
    setToast(null);
    setPreviewAudioReady(false);
  });

  it("ignores immediately while encoding", async () => {
    const previous = sampleClip();
    replaceClip(previous);
    setIsEncoding(true);

    await loadClip("/tmp/other.mp4");

    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(clip()?.path).toBe(previous.path);
  });

  it("does not replaceClip if encoding becomes true after probe resolves", async () => {
    const previous = sampleClip();
    replaceClip(previous);

    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === "probe_clip") {
        setIsEncoding(true);
        return sampleClip({ path: "/tmp/other.mp4", frame_count: 12 });
      }
      return "/tmp/sidecar.wav";
    });

    await loadClip("/tmp/other.mp4");

    expect(mockedInvoke).toHaveBeenCalledWith("probe_clip", { path: "/tmp/other.mp4" });
    expect(clip()?.path).toBe(previous.path);
    expect(clip()?.frame_count).toBe(previous.frame_count);
  });

  it("replaceClip on probe success and toasts missing prepare_preview without crashing", async () => {
    const meta = sampleClip({ path: "/tmp/new.mp4", frame_count: 48 });
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === "probe_clip") return meta;
      if (cmd === "prepare_preview") throw new Error("command prepare_preview not found");
      return "cpu";
    });

    await loadClip("/tmp/new.mp4");

    expect(mockedInvoke).toHaveBeenCalledWith("probe_clip", { path: "/tmp/new.mp4" });
    expect(clip()?.path).toBe("/tmp/new.mp4");
    expect(clip()?.frame_count).toBe(48);
    expect(previewAudioReady()).toBe(false);
    expect(toast()).toBe("command prepare_preview not found");
  });

  it("sets previewAudioReady when prepare_preview returns a sidecar path", async () => {
    const meta = sampleClip({ path: "/tmp/new.mp4" });
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === "probe_clip") return meta;
      if (cmd === "prepare_preview") return "/tmp/sidecar.wav";
      return "cpu";
    });

    await loadClip("/tmp/new.mp4");

    expect(previewAudioReady()).toBe(true);
    expect(toast()).toBeNull();
  });

  it("clears previewAudioReady when prepare_preview returns none", async () => {
    setPreviewAudioReady(true);
    const meta = sampleClip({ path: "/tmp/new.mp4" });
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === "probe_clip") return meta;
      if (cmd === "prepare_preview") return null;
      return "cpu";
    });

    await loadClip("/tmp/new.mp4");

    expect(previewAudioReady()).toBe(false);
    expect(toast()).toBeNull();
  });

  it("second load replaces immediately without confirm", async () => {
    mockedInvoke.mockImplementation(async (cmd, args) => {
      if (cmd === "probe_clip") {
        const path = (args as { path: string }).path;
        return sampleClip({ path, frame_count: path.includes("b") ? 12 : 24 });
      }
      return "/tmp/sidecar.wav";
    });

    await loadClip("/tmp/a.mp4");
    await loadClip("/tmp/b.mp4");

    expect(clip()?.path).toBe("/tmp/b.mp4");
    expect(clip()?.frame_count).toBe(12);
  });

  it("toasts No video stream and keeps previous clip", async () => {
    const previous = sampleClip();
    replaceClip(previous);
    mockedInvoke.mockRejectedValue("No video stream");

    await loadClip("/tmp/audio.mp3");

    expect(toast()).toBe("No video stream");
    expect(clip()?.path).toBe(previous.path);
  });

  it("toasts other probe errors and keeps previous clip", async () => {
    const previous = sampleClip();
    replaceClip(previous);
    mockedInvoke.mockRejectedValue("ffprobe failed with status 1");

    await loadClip("/tmp/bad.mp4");

    expect(toast()).toBe("ffprobe failed with status 1");
    expect(clip()?.path).toBe(previous.path);
  });
});
