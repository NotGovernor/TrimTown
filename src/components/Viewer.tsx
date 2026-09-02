import { Show, createEffect, untrack } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  clip,
  html5Playable,
  isPlaying,
  playhead,
  setHtml5Playable,
  stillUrl,
} from "../stores/appStore";
import { onVideoEnded, onVideoTimeUpdate, registerVideo } from "../lib/playback";
import { requestStill } from "../lib/still";

function videoSrc(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    setHtml5Playable(false);
    return "";
  }
}

export default function Viewer() {
  createEffect(() => {
    const c = clip();
    const playable = html5Playable();
    if (!c || playable) return;
    untrack(() => {
      void requestStill(c.path, playhead(), c.fps, 0);
    });
  });

  return (
    <div class="flex-1 bg-bg-primary min-h-0 relative flex items-center justify-center overflow-hidden">
      <Show when={clip()}>
        {(c) => (
          <>
            <video
              class="w-full h-full object-contain"
              src={videoSrc(c().path)}
              onError={() => setHtml5Playable(false)}
              onTimeUpdate={onVideoTimeUpdate}
              onEnded={onVideoEnded}
              ref={registerVideo}
            />
            <Show when={!isPlaying() && !html5Playable() && stillUrl()}>
              <img
                src={stillUrl()!}
                class="absolute inset-0 w-full h-full object-contain pointer-events-none"
                alt=""
              />
            </Show>
            <Show when={!html5Playable()}>
              <div class="absolute bottom-2 left-0 right-0 text-center text-xs text-text-muted">
                Preview is limited. Trim is not.
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
