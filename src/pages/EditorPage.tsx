import { Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { clip, ffmpegMissing, ffprobeMissing, isEncoding, showToast } from "../stores/appStore";
import { loadClip } from "../lib/loadClip";
import Viewer from "../components/Viewer";
import Timeline from "../components/Timeline";
import Transport from "../components/Transport";
import LogPane from "../components/LogPane";

function missingMessage(): string {
  if (ffmpegMissing() && ffprobeMissing()) return "FFmpeg and FFprobe not found.";
  if (ffmpegMissing()) return "FFmpeg not found.";
  return "FFprobe not found.";
}

async function openClip(): Promise<void> {
  if (isEncoding()) return;
  try {
    const selected = await open({ multiple: false });
    if (selected == null) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;
    await loadClip(path);
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err));
  }
}

export default function EditorPage() {
  return (
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <Show when={ffmpegMissing() || ffprobeMissing()}>
        <div class="bg-danger/10 border-b border-danger/20 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
          <svg class="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span class="text-xs text-danger">
            {missingMessage()}{" "}
            <a
              href="https://ffmpeg.org/download.html"
              target="_blank"
              rel="noreferrer"
              class="underline text-gold hover:opacity-80"
            >
              Download FFmpeg
            </a>{" "}
            to use this app, then restart.
          </span>
        </div>
      </Show>

      <Show
        when={clip()}
        fallback={
          <div class="flex-1 flex items-center justify-center p-8">
            <div class="w-full max-w-xl border border-dashed border-border-light rounded-lg px-8 py-16 flex flex-col items-center gap-4">
              <p class="text-text-muted">Drop a video</p>
              <button
                type="button"
                class="px-4 py-2 rounded text-sm font-medium bg-transparent text-gold border border-gold hover:bg-gold/10"
                onClick={() => {
                  void openClip();
                }}
              >
                Open...
              </button>
            </div>
          </div>
        }
      >
        <Viewer />
        <Timeline />
        <Transport />
      </Show>
      <LogPane />
    </div>
  );
}
