import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isEncoding,
  setConfirmDialogConfig,
  setConfirmDialogOpen,
} from "../stores/appStore";
import { cancelTrim } from "./trim";

let allowClose = false;

export function resetWindowChromeForTests(): void {
  allowClose = false;
}

// Tauri's JS onCloseRequested calls Window.destroy() when this handler does not
// preventDefault. That needs core:window:allow-destroy (allow-close is not enough).
export async function handleCloseRequested(event: { preventDefault: () => void }): Promise<void> {
  if (allowClose || !isEncoding()) return;
  event.preventDefault();
  setConfirmDialogConfig({
    title: "Trim in progress",
    message: "Cancel the trim and quit?",
    confirmText: "Quit",
    cancelText: "Stay",
    confirmVariant: "danger",
    onConfirm: () => {
      void (async () => {
        await cancelTrim();
        allowClose = true;
        await getCurrentWindow().close();
      })();
    },
  });
  setConfirmDialogOpen(true);
}
