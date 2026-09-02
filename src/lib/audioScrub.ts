import { invoke } from "@tauri-apps/api/core";
import { clip, isPlaying, playhead } from "../stores/appStore";
import { frameToSeconds } from "./frame";

const SAMPLE_RATE = 16000;
const GRAIN_SEC = 0.08;
const GRAIN_PERIOD_MS = 40;

let ctx: AudioContext | null = null;
let running = false;
let generation = 0;
const sources: AudioBufferSourceNode[] = [];

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  return ctx;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function playGrain(samples: Float32Array): void {
  if (samples.length === 0) return;
  const audio = getContext();
  const buffer = audio.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  src.connect(audio.destination);
  src.start();
  sources.push(src);
  src.onended = () => {
    const i = sources.indexOf(src);
    if (i >= 0) sources.splice(i, 1);
  };
}

async function runGrainLoop(id: number): Promise<void> {
  const audio = getContext();
  void audio.resume();
  while (running && id === generation) {
    if (!isPlaying()) {
      const c = clip();
      if (c) {
        try {
          const samples = await invoke<number[]>("preview_pcm", {
            startSec: frameToSeconds(playhead(), c.fps),
            durationSec: GRAIN_SEC,
          });
          if (!running || id !== generation) break;
          if (!isPlaying()) playGrain(Float32Array.from(samples));
        } catch {
          // sidecar may not exist yet
        }
      }
    }
    if (!running || id !== generation) break;
    await wait(GRAIN_PERIOD_MS);
  }
}

export function startScrubGrains(): void {
  if (running) return;
  running = true;
  const id = ++generation;
  void runGrainLoop(id);
}

export function stopScrubGrains(): void {
  running = false;
  generation++;
  while (sources.length > 0) {
    const src = sources.pop();
    if (!src) break;
    try {
      src.stop();
    } catch {
      // already stopped
    }
  }
  if (ctx) {
    try {
      void ctx.suspend();
    } catch {
      // ignore
    }
  }
}
