import { createSignal, Show } from "solid-js";
import {
  canTrim,
  clip,
  encoderLabel,
  inFrame,
  isEncoding,
  isPlaying,
  outFrame,
  playhead,
  setInFrame,
  setOutFrame,
} from "../stores/appStore";
import { formatTimecode, parseTimecode } from "../lib/frame";
import { markIn, markOut, seekPlayhead, stepFrame, togglePlayback } from "../lib/playback";
import { cancelTrim, requestTrim } from "../lib/trim";

const outlineBtn =
  "h-8 px-3 inline-flex items-center justify-center rounded text-sm font-medium bg-transparent text-gold border border-gold hover:bg-gold/10";

function clampFrame(frame: number, max: number): number {
  return Math.min(Math.max(Math.round(frame), 0), max);
}

function TimecodeField(props: {
  label: string;
  frame: () => number;
  fps: () => number;
  onApply: (frame: number) => void;
}) {
  const [draft, setDraft] = createSignal<string | null>(null);
  const display = () => draft() ?? formatTimecode(props.frame(), props.fps());

  function apply() {
    const parsed = parseTimecode(display(), props.fps());
    setDraft(null);
    if (parsed === undefined) return;
    props.onApply(parsed);
  }

  return (
    <label class="flex items-center gap-1.5 text-xs text-text-muted">
      <span>{props.label}</span>
      <input
        type="text"
        class="w-28 bg-bg-tertiary border border-border rounded px-2 py-1 font-mono text-text-primary focus:outline-none focus:border-gold/50"
        value={display()}
        onFocus={() => setDraft(formatTimecode(props.frame(), props.fps()))}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span>({props.frame()})</span>
    </label>
  );
}

export default function Transport() {
  const c = () => clip();
  const fps = () => c()?.fps ?? 24;
  const last = () => Math.max(0, (c()?.frame_count ?? 1) - 1);
  const end = () => c()?.frame_count ?? 0;

  return (
    <div class="flex-shrink-0 min-w-0 overflow-x-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-t border-border bg-bg-secondary">
      <div class="flex items-center gap-3 min-w-0">
        <button type="button" class={outlineBtn} onClick={() => markIn()}>
          I
        </button>
        <button type="button" class={outlineBtn} onClick={() => markOut()}>
          O
        </button>
        <button type="button" class={outlineBtn} onClick={() => stepFrame(-1)}>
          ◀
        </button>
        <button type="button" class={outlineBtn} onClick={() => stepFrame(1)}>
          ▶
        </button>
        <button
          type="button"
          class={outlineBtn}
          aria-label={isPlaying() ? "Pause" : "Play"}
          onClick={() => void togglePlayback()}
        >
          {isPlaying() ? (
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
            </svg>
          ) : (
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>
      <div class="flex items-center gap-3">
        <TimecodeField
          label="In"
          frame={inFrame}
          fps={fps}
          onApply={(frame) => setInFrame(clampFrame(frame, end()))}
        />
        <TimecodeField
          label="Playhead"
          frame={playhead}
          fps={fps}
          onApply={(frame) => seekPlayhead(clampFrame(frame, last()), 0)}
        />
        <TimecodeField
          label="Out"
          frame={outFrame}
          fps={fps}
          onApply={(frame) => setOutFrame(clampFrame(frame, end()))}
        />
      </div>
      <div class="flex items-center justify-end gap-3 min-w-0">
        <Show when={encoderLabel()}>
          <span class="text-xs text-text-muted">Will use: {encoderLabel()}</span>
        </Show>
        <button
          type="button"
          class={
            isEncoding()
              ? "h-8 px-4 inline-flex items-center justify-center rounded text-sm font-medium bg-danger text-white hover:bg-danger-hover"
              : `h-8 px-4 inline-flex items-center justify-center rounded text-sm font-medium bg-gold text-bg-primary hover:bg-gold-light ${canTrim() ? "" : "opacity-50 cursor-not-allowed"}`
          }
          onClick={() => {
            if (isEncoding()) {
              void cancelTrim();
              return;
            }
            void requestTrim();
          }}
        >
          {isEncoding() ? "Cancel" : "Trim"}
        </button>
      </div>
    </div>
  );
}
