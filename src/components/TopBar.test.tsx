import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { setSettingsOpen, settingsOpen, setIsPlaying, isPlaying } from "../stores/appStore";

const mockedMinimize = vi.fn();
const mockedToggleMaximize = vi.fn();
const mockedClose = vi.fn();
const mockedIsMaximized = vi.fn(async () => false);
const mockedOnResized = vi.fn(async () => () => {});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: mockedMinimize,
    toggleMaximize: mockedToggleMaximize,
    close: mockedClose,
    isMaximized: mockedIsMaximized,
    onResized: mockedOnResized,
  }),
}));

vi.mock("../lib/playback", () => ({
  haltPlayback: vi.fn(() => {
    setIsPlaying(false);
  }),
}));

import TopBar from "./TopBar";

describe("TopBar settings gear", () => {
  beforeEach(() => {
    setSettingsOpen(false);
    setIsPlaying(true);
    mockedMinimize.mockReset();
    mockedToggleMaximize.mockReset();
    mockedClose.mockReset();
    mockedIsMaximized.mockReset();
    mockedIsMaximized.mockResolvedValue(false);
    mockedOnResized.mockReset();
    mockedOnResized.mockResolvedValue(() => {});
  });

  it("opens settings, does not show an Editor back link, and halts playback", async () => {
    const { haltPlayback } = await import("../lib/playback");
    render(() => <TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(settingsOpen()).toBe(true);
    expect(screen.queryByRole("button", { name: "Editor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(haltPlayback).toHaveBeenCalled();
    expect(isPlaying()).toBe(false);
  });

  it("toggles closed without requiring an Editor link", () => {
    setSettingsOpen(true);
    setIsPlaying(false);
    render(() => <TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(settingsOpen()).toBe(false);
  });
});

describe("TopBar logo and caption buttons", () => {
  beforeEach(() => {
    setSettingsOpen(false);
    setIsPlaying(false);
    mockedMinimize.mockReset();
    mockedToggleMaximize.mockReset();
    mockedClose.mockReset();
    mockedIsMaximized.mockReset();
    mockedIsMaximized.mockResolvedValue(false);
    mockedOnResized.mockReset();
    mockedOnResized.mockResolvedValue(() => {});
  });

  it("shows the logo next to the TrimTown wordmark", () => {
    render(() => <TopBar />);
    const img = screen.getByRole("img", { name: "TrimTown" });
    expect(img).toBeTruthy();
    expect(screen.getByText("TrimTown")).toBeTruthy();
  });

  it("exposes Minimize Maximize Close to the right of Settings", () => {
    render(() => <TopBar />);
    const settings = screen.getByRole("button", { name: "Settings" });
    const min = screen.getByRole("button", { name: "Minimize" });
    const max = screen.getByRole("button", { name: "Maximize" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(settings.compareDocumentPosition(min) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(min.compareDocumentPosition(max) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(max.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Minimize calls window.minimize", async () => {
    render(() => <TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(mockedMinimize).toHaveBeenCalled();
  });

  it("Maximize calls toggleMaximize", async () => {
    render(() => <TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(mockedToggleMaximize).toHaveBeenCalled();
  });

  it("Close calls window.close so onCloseRequested can intercept", async () => {
    render(() => <TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockedClose).toHaveBeenCalled();
  });

  it("labels Restore when maximized", async () => {
    mockedIsMaximized.mockResolvedValue(true);
    render(() => <TopBar />);
    await screen.findByRole("button", { name: "Restore" });
  });
});
