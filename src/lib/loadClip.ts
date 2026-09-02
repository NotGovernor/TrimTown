import { invoke } from "@tauri-apps/api/core";
import { isEncoding, replaceClip, setPreviewAudioReady, showToast } from "../stores/appStore";
import type { ClipMeta } from "../types";
import { refreshEncoderLabel } from "./trim";

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function loadClip(path: string): Promise<void> {
  // Ignore drops while encoding
  if (isEncoding()) return;

  try {
    const meta = await invoke<ClipMeta>("probe_clip", { path });
    if (isEncoding()) {
      showToast("Ignored: trim in progress");
      return;
    }
    replaceClip(meta);
    try {
      const result = await invoke<string | null>("prepare_preview", { path });
      setPreviewAudioReady(result != null && result !== "");
    } catch (err) {
      setPreviewAudioReady(false);
      showToast(errorMessage(err));
    }
    await refreshEncoderLabel();
  } catch (err) {
    showToast(errorMessage(err));
  }
}
