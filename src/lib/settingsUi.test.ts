import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPlaying, setIsPlaying, setSettingsOpen, settingsOpen } from "../stores/appStore";

vi.mock("./playback", () => ({
  haltPlayback: vi.fn(() => {
    setIsPlaying(false);
  }),
}));

import { closeSettings, openSettings, toggleSettings } from "./settingsUi";

describe("settingsUi", () => {
  beforeEach(() => {
    setSettingsOpen(false);
    setIsPlaying(true);
    vi.clearAllMocks();
  });

  it("openSettings halts playback and sets settingsOpen", async () => {
    const { haltPlayback } = await import("./playback");
    openSettings();
    expect(haltPlayback).toHaveBeenCalled();
    expect(isPlaying()).toBe(false);
    expect(settingsOpen()).toBe(true);
  });

  it("closeSettings sets settingsOpen false without playing", () => {
    setSettingsOpen(true);
    closeSettings();
    expect(settingsOpen()).toBe(false);
    expect(isPlaying()).toBe(true);
  });

  it("toggleSettings opens and closes", async () => {
    const { haltPlayback } = await import("./playback");
    toggleSettings();
    expect(settingsOpen()).toBe(true);
    expect(haltPlayback).toHaveBeenCalled();
    toggleSettings();
    expect(settingsOpen()).toBe(false);
  });
});
