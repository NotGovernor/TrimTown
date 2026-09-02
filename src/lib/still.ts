import { invoke } from "@tauri-apps/api/core";
import { setStillUrl, stillUrl } from "../stores/appStore";

let timer: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;
let pending: {
  resolve: (value?: void | false) => void;
  reject: (reason?: unknown) => void;
} | null = null;

export function requestStill(
  path: string,
  frame: number,
  fps: number,
  debounceMs = 40,
): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  pending?.resolve(undefined);
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    const mine = pending;
    const run = () => {
      timer = null;
      void fetchStill(path, frame, fps, id).finally(() => {
        if (pending === mine) {
          pending.resolve();
          pending = null;
        }
      });
    };
    if (debounceMs <= 0) {
      run();
      return;
    }
    timer = setTimeout(run, debounceMs);
  });
}

function invokeErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function fetchStill(
  path: string,
  frame: number,
  fps: number,
  id: number,
): Promise<void> {
  if (id !== requestId) return;
  let b64: string;
  try {
    b64 = await invoke<string>("get_still", { path, frame, fps });
  } catch (err) {
    if (invokeErrorMessage(err) === "still cancelled") return;
    if (id !== requestId) return;
    const prev = stillUrl();
    if (prev) URL.revokeObjectURL(prev);
    setStillUrl(null);
    return;
  }
  if (id !== requestId) return;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  const prev = stillUrl();
  setStillUrl(url);
  if (prev) URL.revokeObjectURL(prev);
}
