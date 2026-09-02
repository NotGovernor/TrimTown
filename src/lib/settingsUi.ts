import { settingsOpen, setSettingsOpen } from "../stores/appStore";
import { haltPlayback } from "./playback";

export function openSettings(): void {
  haltPlayback();
  setSettingsOpen(true);
}

export function closeSettings(): void {
  setSettingsOpen(false);
}

export function toggleSettings(): void {
  if (settingsOpen()) closeSettings();
  else openSettings();
}
