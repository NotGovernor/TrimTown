import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  settings,
  setSettings,
  setFfmpegMissing,
  setFfprobeMissing,
  encoderLabel,
} from "../stores/appStore";
import type { AppSettings, TrimMode } from "../types";
import { persistSettingsThenRefreshEncoder, refreshEncoderLabel } from "../lib/trim";

type PathStatus = "good" | "not_found" | null;

export default function SettingsPage() {
  const [verifying, setVerifying] = createSignal(false);
  const [ffmpegStatus, setFfmpegStatus] = createSignal<PathStatus>(null);
  const [ffprobeStatus, setFfprobeStatus] = createSignal<PathStatus>(null);

  const setTrimMode = (trim_mode: TrimMode) => {
    setSettings((s) => ({ ...s, trim_mode }));
    void persistSettingsThenRefreshEncoder();
  };

  const handleVerify = async () => {
    setVerifying(true);
    setFfmpegStatus(null);
    setFfprobeStatus(null);
    try {
      await invoke("save_settings", { newSettings: settings() });
      const [ffmpegFound, ffprobeFound] = await invoke<[boolean, boolean]>("verify_ffmpeg_paths");
      const refreshed = await invoke<AppSettings>("load_settings");
      setSettings(refreshed);
      setFfmpegMissing(!refreshed.ffmpeg_path);
      setFfprobeMissing(!refreshed.ffprobe_path);
      setFfmpegStatus(ffmpegFound ? "good" : "not_found");
      setFfprobeStatus(ffprobeFound ? "good" : "not_found");
      await refreshEncoderLabel();
    } catch {
      setFfmpegStatus("not_found");
      setFfprobeStatus("not_found");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="space-y-6 max-w-2xl">
        <div>
          <label class="block text-xs font-medium text-text-muted mb-1">
            FFmpeg Path
            {ffmpegStatus() === "good" && (
              <span class="ml-2 text-xs text-status-completed font-normal">Good</span>
            )}
            {ffmpegStatus() === "not_found" && (
              <span class="ml-2 text-xs text-danger font-normal">Not Found</span>
            )}
          </label>
          <input
            type="text"
            value={settings().ffmpeg_path}
            onInput={(e) => setSettings((s) => ({ ...s, ffmpeg_path: e.currentTarget.value }))}
            placeholder="ffmpeg"
            class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-text-muted mb-1">
            FFprobe Path
            {ffprobeStatus() === "good" && (
              <span class="ml-2 text-xs text-status-completed font-normal">Good</span>
            )}
            {ffprobeStatus() === "not_found" && (
              <span class="ml-2 text-xs text-danger font-normal">Not Found</span>
            )}
          </label>
          <input
            type="text"
            value={settings().ffprobe_path}
            onInput={(e) => setSettings((s) => ({ ...s, ffprobe_path: e.currentTarget.value }))}
            placeholder="ffprobe"
            class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying()}
            class="px-4 py-2 rounded text-sm font-medium bg-gold text-bg-primary hover:bg-gold-light disabled:opacity-50 transition-colors"
          >
            Verify
          </button>
        </div>

        <div>
          <p class="block text-xs font-medium text-text-muted mb-2">Trim mode</p>
          <div class="flex gap-2">
            <button
              type="button"
              class={`px-3 py-1.5 rounded text-sm border ${
                settings().trim_mode === "accurate"
                  ? "border-gold text-gold"
                  : "border-border text-text-muted"
              }`}
              onClick={() => setTrimMode("accurate")}
            >
              Accurate
            </button>
            <button
              type="button"
              class={`px-3 py-1.5 rounded text-sm border ${
                settings().trim_mode === "fast"
                  ? "border-gold text-gold"
                  : "border-border text-text-muted"
              }`}
              onClick={() => setTrimMode("fast")}
            >
              Fast
            </button>
          </div>
          {settings().trim_mode === "fast" && (
            <p class="text-text-muted text-xs mt-2">Fast mode may start on the previous keyframe.</p>
          )}
        </div>

        <label class="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={settings().cpu_only}
            onChange={(e) => {
              setSettings((s) => ({ ...s, cpu_only: e.currentTarget.checked }));
              void persistSettingsThenRefreshEncoder();
            }}
            class="accent-gold"
          />
          CPU only
        </label>

        <label class="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={settings().open_when_done}
            onChange={(e) => setSettings((s) => ({ ...s, open_when_done: e.currentTarget.checked }))}
            class="accent-gold"
          />
          Open when done
        </label>

        <Show when={encoderLabel()}>
          <p class="text-xs text-text-muted">Will use: {encoderLabel()}</p>
        </Show>
      </div>
    </div>
  );
}
