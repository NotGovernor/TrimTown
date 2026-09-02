import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import Transport from "./Transport";
import {
  replaceClip,
  setIsPlaying,
  setFfmpegMissing,
  setIsEncoding,
  setClip,
  setEncoderLabel,
} from "../stores/appStore";
import type { ClipMeta } from "../types";

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

describe("Transport play button", () => {
  beforeEach(() => {
    setClip(null);
    setFfmpegMissing(false);
    setIsEncoding(false);
    setIsPlaying(false);
    replaceClip(sampleClip());
  });

  it("labels Play when paused and does not say Space", () => {
    render(() => <Transport />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.queryByText("Space")).toBeNull();
  });

  it("labels Pause when playing", () => {
    setIsPlaying(true);
    render(() => <Transport />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });
});

describe("Transport trim placement", () => {
  beforeEach(() => {
    setClip(null);
    setFfmpegMissing(false);
    setIsEncoding(false);
    setIsPlaying(false);
    replaceClip(sampleClip());
    setEncoderLabel("h264_nvenc");
  });

  it("places Trim after the encoder label", () => {
    render(() => <Transport />);
    const trim = screen.getByRole("button", { name: "Trim" });
    const encoder = screen.getByText(/Will use:/);
    const position = trim.compareDocumentPosition(encoder);
    expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe("Transport timecode labels", () => {
  beforeEach(() => {
    setClip(null);
    setFfmpegMissing(false);
    setIsEncoding(false);
    setIsPlaying(false);
    replaceClip(sampleClip());
  });

  it("labels In Playhead Out in title case", () => {
    render(() => <Transport />);
    expect(screen.getByText("In")).toBeTruthy();
    expect(screen.getByText("Playhead")).toBeTruthy();
    expect(screen.getByText("Out")).toBeTruthy();
    expect(screen.queryByText("in")).toBeNull();
    expect(screen.queryByText("playhead")).toBeNull();
    expect(screen.queryByText("out")).toBeNull();
  });
});

describe("Transport Will use visibility", () => {
  beforeEach(() => {
    setClip(null);
    setFfmpegMissing(false);
    setIsEncoding(false);
    setEncoderLabel("");
  });

  it("hides Will use when encoderLabel is empty", () => {
    render(() => <Transport />);
    expect(screen.queryByText(/Will use:/)).toBeNull();
  });

  it("shows Will use when encoderLabel is set", () => {
    replaceClip(sampleClip());
    setEncoderLabel("copy");
    render(() => <Transport />);
    expect(screen.getByText("Will use: copy")).toBeTruthy();
  });
});

describe("Transport three zones", () => {
  it("keeps Play before In and Trim after Will use", () => {
    replaceClip(sampleClip());
    setEncoderLabel("libx264 (CPU)");
    setFfmpegMissing(false);
    setIsEncoding(false);
    render(() => <Transport />);
    const play = screen.getByRole("button", { name: "Play" });
    const inLabel = screen.getByText("In");
    const encoder = screen.getByText(/Will use:/);
    const trim = screen.getByRole("button", { name: "Trim" });
    expect(play.compareDocumentPosition(inLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(encoder.compareDocumentPosition(trim) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
