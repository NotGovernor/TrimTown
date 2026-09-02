import { createMemo, createSignal } from "solid-js";
import type { AppSettings, ClipMeta } from "../types";

export const [settingsOpen, setSettingsOpen] = createSignal(false);

export const [settings, setSettings] = createSignal<AppSettings>({
  ffmpeg_path: "",
  ffprobe_path: "",
  trim_mode: "accurate",
  cpu_only: false,
  open_when_done: true,
});

export const [ffmpegMissing, setFfmpegMissing] = createSignal(false);
export const [ffprobeMissing, setFfprobeMissing] = createSignal(false);
export const [clip, setClip] = createSignal<ClipMeta | null>(null);
export const [playhead, setPlayhead] = createSignal(0);
export const [inFrame, setInFrame] = createSignal(0);
export const [outFrame, setOutFrame] = createSignal(0);
export const [isPlaying, setIsPlaying] = createSignal(false);
export const [isScrubbing, setIsScrubbing] = createSignal(false);
export const [html5Playable, setHtml5Playable] = createSignal(true);
export const [isEncoding, setIsEncoding] = createSignal(false);
export const [logLines, setLogLines] = createSignal<string[]>([]);
export const [logPaneOpen, setLogPaneOpen] = createSignal(false);
export const [encoderLabel, setEncoderLabel] = createSignal("");
export const [toast, setToast] = createSignal<string | null>(null);

const TOAST_AUTO_MS = 4000;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function clearToastTimer(): void {
  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

/** persist defaults true (errors). Pass false for “Trim complete”. null clears. */
export function showToast(message: string | null, persist = true): void {
  clearToastTimer();
  setToast(message);
  if (message !== null && !persist) {
    toastTimer = setTimeout(() => {
      toastTimer = null;
      setToast(null);
    }, TOAST_AUTO_MS);
  }
}
export const [confirmDialogOpen, setConfirmDialogOpen] = createSignal(false);
export const [confirmDialogConfig, setConfirmDialogConfig] = createSignal<{
  title: string;
  message: string;
  detail?: string;
  confirmText: string;
  cancelText?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
} | null>(null);
export const [previewAudioReady, setPreviewAudioReady] = createSignal(false);
export const [stillUrl, setStillUrl] = createSignal<string | null>(null);

export function replaceClip(meta: ClipMeta): void {
  setClip(meta);
  setInFrame(0);
  setOutFrame(meta.frame_count);
  setPlayhead(0);
  setLogLines([]);
  setHtml5Playable(true);
  setStillUrl(null);
  setPreviewAudioReady(false);
  setIsPlaying(false);
}

export function setInFromPlayhead(): void {
  setInFrame(playhead());
}

export function setOutFromPlayhead(): void {
  const count = clip()?.frame_count ?? 0;
  setOutFrame(Math.min(playhead() + 1, count));
}

export const canTrim = createMemo(
  () =>
    clip() !== null &&
    outFrame() > inFrame() &&
    !ffmpegMissing() &&
    !isEncoding(),
);
