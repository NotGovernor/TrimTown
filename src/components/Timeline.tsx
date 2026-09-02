import { onCleanup } from "solid-js";
import { clip, inFrame, isPlaying, outFrame, playhead, setIsScrubbing } from "../stores/appStore";
import { startScrubGrains, stopScrubGrains } from "../lib/audioScrub";
import { frameToSeconds, secondsToFrame } from "../lib/frame";
import { haltPlayback, seekPlayhead } from "../lib/playback";

function frameAtClientX(el: HTMLElement, clientX: number): number | null {
  const c = clip();
  if (!c) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  return secondsToFrame(ratio * c.duration, c.fps, c.frame_count);
}

function pct(frame: number): string {
  const c = clip();
  if (!c || c.duration <= 0) return "0%";
  return `${(frameToSeconds(frame, c.fps) / c.duration) * 100}%`;
}

export default function Timeline() {
  let bar: HTMLDivElement | undefined;

  onCleanup(() => {
    stopScrubGrains();
    setIsScrubbing(false);
  });

  function onPointerDown(e: PointerEvent) {
    if (!bar || e.button !== 0) return;
    if (isPlaying()) haltPlayback();
    setIsScrubbing(true);
    startScrubGrains();
    bar.setPointerCapture(e.pointerId);
    const frame = frameAtClientX(bar, e.clientX);
    if (frame !== null) seekPlayhead(frame, 40);
  }

  function onPointerMove(e: PointerEvent) {
    if (!bar || !bar.hasPointerCapture(e.pointerId)) return;
    const frame = frameAtClientX(bar, e.clientX);
    if (frame !== null) seekPlayhead(frame, 40);
  }

  function onPointerUp(e: PointerEvent) {
    stopScrubGrains();
    if (!bar) return;
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    setIsScrubbing(false);
    const frame = frameAtClientX(bar, e.clientX);
    if (frame !== null) seekPlayhead(frame, 0);
    else {
      const c = clip();
      if (c) seekPlayhead(playhead(), 0);
    }
  }

  return (
    <div
      ref={(el) => {
        bar = el;
      }}
      class="h-8 bg-bg-tertiary w-full relative flex-shrink-0 select-none cursor-pointer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        class="absolute top-0 bottom-0 bg-gold/20 pointer-events-none"
        style={{ left: pct(inFrame()), width: pct(Math.max(0, outFrame() - inFrame())) }}
      />
      <div
        class="absolute top-0 bottom-0 w-px bg-gold pointer-events-none"
        style={{ left: pct(playhead()) }}
      />
    </div>
  );
}
