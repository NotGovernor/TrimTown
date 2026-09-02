import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import SettingsPage from "./SettingsPage";
import {
  replaceClip,
  setClip,
  setEncoderLabel,
  setSettings,
} from "../stores/appStore";
import type { ClipMeta } from "../types";

vi.mock("../lib/trim", () => ({
  refreshEncoderLabel: vi.fn(),
  persistSettingsThenRefreshEncoder: vi.fn(),
}));

function sampleClip(): ClipMeta {
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
  };
}

describe("SettingsPage Will use", () => {
  beforeEach(() => {
    setClip(null);
    setEncoderLabel("");
    setSettings({
      ffmpeg_path: "",
      ffprobe_path: "",
      trim_mode: "accurate",
      cpu_only: false,
      open_when_done: true,
    });
  });

  it("hides Will use when no clip", () => {
    render(() => <SettingsPage />);
    expect(screen.queryByText(/Will use:/)).toBeNull();
  });

  it("shows Will use when clip and label exist", () => {
    replaceClip(sampleClip());
    setEncoderLabel("h264_nvenc");
    render(() => <SettingsPage />);
    expect(screen.getByText("Will use: h264_nvenc")).toBeTruthy();
  });

  it("persists and refreshes when Fast is chosen", async () => {
    const { persistSettingsThenRefreshEncoder } = await import("../lib/trim");
    replaceClip(sampleClip());
    setEncoderLabel("h264_nvenc");
    render(() => <SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Fast" }));
    expect(persistSettingsThenRefreshEncoder).toHaveBeenCalled();
  });

  it("persists and refreshes when CPU only is checked", async () => {
    const { persistSettingsThenRefreshEncoder } = await import("../lib/trim");
    replaceClip(sampleClip());
    render(() => <SettingsPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: "CPU only" }));
    expect(persistSettingsThenRefreshEncoder).toHaveBeenCalled();
  });
});
