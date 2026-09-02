import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ClipMeta } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

class FakeBuffer {
  private data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeSource {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  sampleRate: number;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createBuffer = vi.fn((_channels: number, length: number, _rate: number) => new FakeBuffer(length));
  createBufferSource = vi.fn(() => new FakeSource());
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
    constructed.push(this);
  }
}

const constructed: FakeAudioContext[] = [];

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

describe("audioScrub", () => {
  let playGrain: typeof import("./audioScrub").playGrain;
  let startScrubGrains: typeof import("./audioScrub").startScrubGrains;
  let stopScrubGrains: typeof import("./audioScrub").stopScrubGrains;
  let setClip: typeof import("../stores/appStore").setClip;
  let setPlayhead: typeof import("../stores/appStore").setPlayhead;
  let setIsPlaying: typeof import("../stores/appStore").setIsPlaying;

  beforeEach(async () => {
    constructed.length = 0;
    vi.resetModules();
    vi.useFakeTimers();
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue([0.1, 0.2, 0.3]);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const store = await import("../stores/appStore");
    setClip = store.setClip;
    setPlayhead = store.setPlayhead;
    setIsPlaying = store.setIsPlaying;
    const mod = await import("./audioScrub");
    playGrain = mod.playGrain;
    startScrubGrains = mod.startScrubGrains;
    stopScrubGrains = mod.stopScrubGrains;
    setClip(sampleClip());
    setPlayhead(24);
    setIsPlaying(false);
  });

  afterEach(() => {
    stopScrubGrains();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("playGrain schedules a 16 kHz buffer source", () => {
    playGrain(new Float32Array([0.5, -0.5]));
    expect(constructed[0]?.sampleRate).toBe(16000);
    const ctx = constructed[0];
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 2, 16000);
    expect(ctx.createBufferSource).toHaveBeenCalled();
    const src = ctx.createBufferSource.mock.results[0]?.value as FakeSource;
    expect(src.start).toHaveBeenCalled();
  });

  it("loops preview_pcm at the playhead then plays grains", async () => {
    startScrubGrains();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(mockedInvoke).toHaveBeenCalledWith("preview_pcm", {
      startSec: 1,
      durationSec: 0.08,
    });
    expect(constructed[0]?.createBufferSource).toHaveBeenCalled();
  });

  it("swallows preview_pcm failures", async () => {
    mockedInvoke.mockRejectedValue(new Error("no sidecar"));
    startScrubGrains();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(40);

    expect(mockedInvoke).toHaveBeenCalled();
    expect(constructed[0]?.createBufferSource).not.toHaveBeenCalled();
  });

  it("does not play grains while HTML5 is playing", async () => {
    setIsPlaying(true);
    startScrubGrains();
    await vi.advanceTimersByTimeAsync(80);

    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("stopScrubGrains ends the loop", async () => {
    startScrubGrains();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    const calls = mockedInvoke.mock.calls.length;
    stopScrubGrains();
    await vi.advanceTimersByTimeAsync(200);
    expect(mockedInvoke.mock.calls.length).toBe(calls);
  });
});
