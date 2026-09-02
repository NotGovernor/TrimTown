import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  playhead,
  replaceClip,
  setClip,
  setHtml5Playable,
  setPlayhead,
} from "../stores/appStore";
import type { ClipMeta } from "../types";

vi.mock("./still", () => ({
  requestStill: vi.fn(),
}));

import { markIn, markOut, seekPlayhead, stepFrame } from "./playback";
import { requestStill } from "./still";

const mockedRequestStill = vi.mocked(requestStill);

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

describe("playback stills", () => {
  beforeEach(() => {
    setClip(null);
    setPlayhead(0);
    setHtml5Playable(true);
    mockedRequestStill.mockReset();
    mockedRequestStill.mockResolvedValue(undefined);
  });

  it("does not fetch a still on step/seek/mark when html5 is playable", () => {
    replaceClip(sampleClip());
    setHtml5Playable(true);
    mockedRequestStill.mockClear();
    stepFrame(1);
    seekPlayhead(10, 0);
    markIn();
    markOut();
    expect(mockedRequestStill).not.toHaveBeenCalled();
  });

  it("fetches a still on step when html5 is not playable", () => {
    replaceClip(sampleClip());
    setHtml5Playable(false);
    mockedRequestStill.mockClear();
    stepFrame(1);
    expect(mockedRequestStill).toHaveBeenCalled();
    expect(mockedRequestStill.mock.calls[0]?.[1]).toBe(1);
  });

  it("clamps playhead at 0", () => {
    replaceClip(sampleClip());
    expect(playhead()).toBe(0);
    stepFrame(1);
    expect(playhead()).toBe(1);
    stepFrame(-1);
    expect(playhead()).toBe(0);
    stepFrame(-1);
    expect(playhead()).toBe(0);
  });
});
