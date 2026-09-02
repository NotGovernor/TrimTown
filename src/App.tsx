import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TopBar from "./components/TopBar";
import EditorPage from "./pages/EditorPage";
import SettingsModal from "./components/SettingsModal";
import ConfirmDialog from "./components/ConfirmDialog";
import { loadClip } from "./lib/loadClip";
import { markIn, markOut, stepFrame, togglePlayback } from "./lib/playback";
import { closeSettings } from "./lib/settingsUi";
import { appendTrimLog, handleTrimDone, type TrimDonePayload } from "./lib/trim";
import { handleCloseRequested } from "./lib/windowChrome";
import {
  clip,
  isEncoding,
  setFfmpegMissing,
  setFfprobeMissing,
  setSettings,
  showToast,
  settings,
  settingsOpen,
  toast,
} from "./stores/appStore";
import type { AppSettings } from "./types";

let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape" && settingsOpen()) {
    e.preventDefault();
    closeSettings();
    return;
  }
  if (isTextInput(e.target)) return;
  if (e.repeat) return;
  if (settingsOpen()) return;
  if (!clip()) return;

  if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    markIn();
  } else if (e.key === "o" || e.key === "O") {
    e.preventDefault();
    markOut();
  } else if (e.key === " ") {
    e.preventDefault();
    void togglePlayback();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    stepFrame(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    stepFrame(1);
  }
}

export default function App() {
  const [loaded, setLoaded] = createSignal(false);

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);

    void (async () => {
      try {
        const loadedSettings = await invoke<AppSettings>("load_settings");
        setSettings(loadedSettings);
        setFfmpegMissing(loadedSettings.ffmpeg_path === "");
        setFfprobeMissing(loadedSettings.ffprobe_path === "");
      } catch {
        setFfmpegMissing(true);
        setFfprobeMissing(true);
      } finally {
        setLoaded(true);
      }
    })();

    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        if (isEncoding()) return;
        const path = event.payload.paths[0];
        if (!path) return;
        void loadClip(path);
      })
      .then((fn) => {
        unlisten = fn;
      });

    let unlistenLog: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    void listen<string>("trim-log", (event) => {
      appendTrimLog(event.payload);
    }).then((fn) => {
      unlistenLog = fn;
    });
    void listen<TrimDonePayload>("trim-done", (event) => {
      void handleTrimDone(event.payload);
    }).then((fn) => {
      unlistenDone = fn;
    });

    let unlistenClose: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => handleCloseRequested(event))
      .then((fn) => {
        unlistenClose = fn;
      });

    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      unlisten?.();
      unlistenLog?.();
      unlistenDone?.();
      unlistenClose?.();
      if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    });
  });

  createEffect(
    on(
      settings,
      (s) => {
        if (!loaded()) return;
        if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
        settingsSaveTimer = setTimeout(async () => {
          try {
            await invoke("save_settings", { newSettings: s });
          } catch (err) {
            showToast(`Failed to save settings: ${err}`);
          }
        }, 2000);
      },
      { defer: true },
    ),
  );

  return (
    <div class="flex flex-col h-full bg-bg-primary text-text-primary">
      <TopBar />
      <EditorPage />
      <SettingsModal />
      <ConfirmDialog />
      <Show when={toast()}>
        <div
          class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-bg-elevated border border-border px-4 py-2 rounded text-sm text-text-primary z-[70] shadow-lg cursor-pointer"
          onClick={() => showToast(null)}
        >
          {toast()}
        </div>
      </Show>
    </div>
  );
}
