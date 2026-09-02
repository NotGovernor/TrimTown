import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  canTrim,
  clip,
  ffmpegMissing,
  inFrame,
  isEncoding,
  outFrame,
  setConfirmDialogConfig,
  setConfirmDialogOpen,
  setEncoderLabel,
  setIsEncoding,
  setLogLines,
  showToast,
  settings,
} from "../stores/appStore";

export type TrimDonePayload = {
  ok: boolean;
  output_path: string;
  error: string | null;
};

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function trimBlockedReason(): string {
  if (clip() === null) return "No clip loaded";
  if (ffmpegMissing()) return "FFmpeg not found.";
  if (isEncoding()) return "Trim in progress";
  if (outFrame() <= inFrame()) return "Out must be after In";
  return "Cannot trim";
}

export async function requestTrim(): Promise<void> {
  if (isEncoding()) return;
  if (!canTrim()) {
    showToast(trimBlockedReason());
    return;
  }
  const c = clip();
  if (!c) return;
  const outputPath = await invoke<string>("trimmed_output_path", { path: c.path });
  const exists = await invoke<boolean>("output_exists", { path: outputPath });
  if (exists) {
    setConfirmDialogConfig({
      title: "Overwrite existing file?",
      message: "A trimmed file already exists at this path.",
      detail: outputPath,
      confirmText: "Overwrite",
      confirmVariant: "danger",
      onConfirm: () => {
        void beginTrim(c.path, inFrame(), outFrame(), outputPath);
      },
    });
    setConfirmDialogOpen(true);
    return;
  }
  await beginTrim(c.path, inFrame(), outFrame(), outputPath);
}

export async function beginTrim(
  path: string,
  inFrameN: number,
  outFrameN: number,
  outputPath: string,
): Promise<void> {
  showToast(null);
  setIsEncoding(true);
  setLogLines([]);
  try {
    await invoke("start_trim", {
      path,
      inFrame: inFrameN,
      outFrame: outFrameN,
      outputPath,
    });
  } catch (err) {
    setIsEncoding(false);
    showToast(errorMessage(err));
  }
}

export async function cancelTrim(): Promise<void> {
  try {
    await invoke("cancel_trim");
  } catch (err) {
    showToast(errorMessage(err));
  }
}

export async function handleTrimDone(payload: TrimDonePayload): Promise<void> {
  setIsEncoding(false);
  if (payload.ok) {
    showToast("Trim complete", false);
    if (settings().open_when_done && payload.output_path) {
      try {
        await openPath(payload.output_path);
      } catch {
        // Permission or OS opener failure must not hide success.
      }
    }
    return;
  }
  showToast(payload.error ?? "Trim failed");
}

export async function persistSettingsThenRefreshEncoder(): Promise<void> {
  try {
    await invoke("save_settings", { newSettings: settings() });
  } catch {
    // in-memory settings already changed; still try describe_encoder
  }
  await refreshEncoderLabel();
}

export async function refreshEncoderLabel(): Promise<void> {
  if (!clip()) {
    setEncoderLabel("");
    return;
  }
  try {
    const label = await invoke<string>("describe_encoder");
    setEncoderLabel(label);
  } catch {
    setEncoderLabel("");
  }
}

export function appendTrimLog(line: string): void {
  setLogLines((lines) => [...lines, line]);
}
