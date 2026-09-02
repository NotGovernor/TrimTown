import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  clip,
  confirmDialogOpen,
  encoderLabel,
  isEncoding,
  logLines,
  replaceClip,
  setClip,
  setConfirmDialogOpen,
  setFfmpegMissing,
  setInFrame,
  setIsEncoding,
  setOutFrame,
  setPlayhead,
  setSettings,
  setToast,
  toast,
} from "../stores/appStore";
import type { ClipMeta } from "../types";
import {
  beginTrim,
  handleTrimDone,
  persistSettingsThenRefreshEncoder,
  refreshEncoderLabel,
  requestTrim,
  trimBlockedReason,
} from "./trim";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedOpenPath = vi.mocked(openPath);

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

describe("requestTrim", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedOpenPath.mockReset();
    setClip(null);
    setInFrame(0);
    setOutFrame(0);
    setPlayhead(0);
    setFfmpegMissing(false);
    setIsEncoding(false);
    setToast(null);
    setConfirmDialogOpen(false);
    setSettings((s) => ({ ...s, open_when_done: true }));
  });

  it("toasts when trim is blocked", async () => {
    await requestTrim();
    expect(toast()).toBe("No clip loaded");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("opens ConfirmDialog when output exists", async () => {
    replaceClip(sampleClip());
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === "trimmed_output_path") return "/tmp/clip_trimmed.mp4";
      if (cmd === "output_exists") return true;
      return undefined;
    });

    await requestTrim();

    expect(confirmDialogOpen()).toBe(true);
    expect(isEncoding()).toBe(false);
    expect(mockedInvoke).not.toHaveBeenCalledWith("start_trim", expect.anything());
  });

  it("starts trim when output does not exist", async () => {
    replaceClip(sampleClip());
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === "trimmed_output_path") return "/tmp/clip_trimmed.mp4";
      if (cmd === "output_exists") return false;
      return undefined;
    });

    await requestTrim();

    expect(isEncoding()).toBe(true);
    expect(logLines()).toEqual([]);
    expect(mockedInvoke).toHaveBeenCalledWith("start_trim", {
      path: "/tmp/clip.mp4",
      inFrame: 0,
      outFrame: 240,
      outputPath: "/tmp/clip_trimmed.mp4",
    });
  });
});

describe("beginTrim", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    setIsEncoding(false);
    setToast(null);
  });

  it("clears encoding and toasts if start_trim fails", async () => {
    mockedInvoke.mockRejectedValue("ffmpeg missing");
    await beginTrim("/tmp/clip.mp4", 0, 24, "/tmp/clip_trimmed.mp4");
    expect(isEncoding()).toBe(false);
    expect(toast()).toBe("ffmpeg missing");
  });

  it("clears a previous error toast when a trim actually starts", async () => {
    setToast("Cancelled");
    mockedInvoke.mockResolvedValue(undefined);
    await beginTrim("/tmp/clip.mp4", 0, 24, "/tmp/clip_trimmed.mp4");
    expect(toast()).toBeNull();
    expect(isEncoding()).toBe(true);
  });
});

describe("handleTrimDone", () => {
  beforeEach(() => {
    mockedOpenPath.mockReset();
    mockedOpenPath.mockResolvedValue(undefined);
    setIsEncoding(true);
    setToast(null);
    setSettings((s) => ({ ...s, open_when_done: true }));
    replaceClip(sampleClip());
  });

  it("toasts, stays on source, and opens path when done", async () => {
    await handleTrimDone({ ok: true, output_path: "/tmp/clip_trimmed.mp4", error: null });
    expect(isEncoding()).toBe(false);
    expect(toast()).toBe("Trim complete");
    expect(clip()?.path).toBe("/tmp/clip.mp4");
    expect(mockedOpenPath).toHaveBeenCalledWith("/tmp/clip_trimmed.mp4");
  });

  it("does not open path when open_when_done is false", async () => {
    setSettings((s) => ({ ...s, open_when_done: false }));
    await handleTrimDone({ ok: true, output_path: "/tmp/clip_trimmed.mp4", error: null });
    expect(mockedOpenPath).not.toHaveBeenCalled();
  });

  it("toasts error on failure", async () => {
    await handleTrimDone({ ok: false, output_path: "/tmp/clip_trimmed.mp4", error: "Cancelled" });
    expect(toast()).toBe("Cancelled");
    expect(mockedOpenPath).not.toHaveBeenCalled();
  });

  it("keeps Trim complete toast if openPath rejects", async () => {
    mockedOpenPath.mockRejectedValue("opener.open_path not allowed. Permissions associated with this command: opener:allow-open-path");
    await handleTrimDone({ ok: true, output_path: "/tmp/clip_trimmed.mp4", error: null });
    expect(toast()).toBe("Trim complete");
    expect(mockedOpenPath).toHaveBeenCalledWith("/tmp/clip_trimmed.mp4");
  });
});

describe("refreshEncoderLabel", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    setClip(null);
  });

  it("clears label without clip", async () => {
    await refreshEncoderLabel();
    expect(encoderLabel()).toBe("");
  });

  it("sets label from describe_encoder", async () => {
    replaceClip(sampleClip());
    mockedInvoke.mockResolvedValue("libx264 (CPU)");
    await refreshEncoderLabel();
    expect(encoderLabel()).toBe("libx264 (CPU)");
  });

  it("persistSettingsThenRefreshEncoder saves then describe_encoder", async () => {
    replaceClip(sampleClip());
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "save_settings") return undefined;
      if (cmd === "describe_encoder") return "copy";
      throw new Error(cmd);
    });
    await persistSettingsThenRefreshEncoder();
    expect(mockedInvoke.mock.calls.map((c) => c[0])).toEqual([
      "save_settings",
      "describe_encoder",
    ]);
    expect(encoderLabel()).toBe("copy");
  });

  it("persistSettingsThenRefreshEncoder still refreshes if save fails", async () => {
    replaceClip(sampleClip());
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "save_settings") throw new Error("disk");
      if (cmd === "describe_encoder") return "libx264 (CPU)";
      throw new Error(cmd);
    });
    await persistSettingsThenRefreshEncoder();
    expect(encoderLabel()).toBe("libx264 (CPU)");
  });
});

describe("trimBlockedReason", () => {
  it("reports ffmpeg missing", () => {
    replaceClip(sampleClip());
    setFfmpegMissing(true);
    expect(trimBlockedReason()).toBe("FFmpeg not found.");
  });
});
