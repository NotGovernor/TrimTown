import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import SettingsModal from "./SettingsModal";
import { setSettingsOpen, settingsOpen } from "../stores/appStore";

describe("SettingsModal", () => {
  beforeEach(() => setSettingsOpen(true));

  it("renders nothing when closed", () => {
    setSettingsOpen(false);
    render(() => <SettingsModal />);
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("closes on backdrop click", () => {
    render(() => <SettingsModal />);
    const backdrop = screen
      .getByRole("heading", { name: "Settings" })
      .closest("div.fixed")
      ?.querySelector("div.absolute.inset-0");
    fireEvent.click(backdrop!);
    expect(settingsOpen()).toBe(false);
  });

  it("closes on Close button", () => {
    render(() => <SettingsModal />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(settingsOpen()).toBe(false);
  });

  it("closes on Escape", () => {
    render(() => <SettingsModal />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(settingsOpen()).toBe(false);
  });

  it("does not close when clicking the card body", () => {
    render(() => <SettingsModal />);
    fireEvent.click(screen.getByRole("heading", { name: "Settings" }));
    expect(settingsOpen()).toBe(true);
  });

  it("starts below the TopBar instead of covering it", () => {
    render(() => <SettingsModal />);
    const overlay = screen.getByRole("heading", { name: "Settings" }).closest("div.fixed");
    expect(overlay?.className).toMatch(/top-14/);
    expect(overlay?.className).not.toMatch(/inset-0/);
  });
});
