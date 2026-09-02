import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmDialogConfig,
  confirmDialogOpen,
  setConfirmDialogOpen,
  setIsEncoding,
} from "../stores/appStore";
import { handleCloseRequested, resetWindowChromeForTests } from "./windowChrome";

const mockedClose = vi.fn();
const mockedPrevent = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mockedClose,
  }),
}));

vi.mock("./trim", () => ({
  cancelTrim: vi.fn(async () => {}),
}));

describe("handleCloseRequested", () => {
  beforeEach(() => {
    mockedClose.mockReset();
    mockedPrevent.mockReset();
    setIsEncoding(false);
    setConfirmDialogOpen(false);
    resetWindowChromeForTests();
  });

  it("does not prevent when idle", async () => {
    await handleCloseRequested({ preventDefault: mockedPrevent } as never);
    expect(mockedPrevent).not.toHaveBeenCalled();
    expect(confirmDialogOpen()).toBe(false);
  });

  it("prevents and opens Stay/Quit when encoding", async () => {
    setIsEncoding(true);
    await handleCloseRequested({ preventDefault: mockedPrevent } as never);
    expect(mockedPrevent).toHaveBeenCalled();
    expect(confirmDialogOpen()).toBe(true);
    expect(confirmDialogConfig()?.title).toBe("Trim in progress");
    expect(confirmDialogConfig()?.message).toBe("Cancel the trim and quit?");
    expect(confirmDialogConfig()?.confirmText).toBe("Quit");
    expect(confirmDialogConfig()?.cancelText).toBe("Stay");
    expect(confirmDialogConfig()?.confirmVariant).toBe("danger");
  });

  it("Quit cancels trim then closes", async () => {
    const { cancelTrim } = await import("./trim");
    setIsEncoding(true);
    await handleCloseRequested({ preventDefault: mockedPrevent } as never);
    await confirmDialogConfig()?.onConfirm();
    expect(cancelTrim).toHaveBeenCalled();
    expect(mockedClose).toHaveBeenCalled();
  });

  it("second close after Quit is not prevented", async () => {
    setIsEncoding(true);
    await handleCloseRequested({ preventDefault: mockedPrevent } as never);
    await confirmDialogConfig()?.onConfirm();
    mockedPrevent.mockReset();
    // still encoding until trim-done; force flag must win
    await handleCloseRequested({ preventDefault: mockedPrevent } as never);
    expect(mockedPrevent).not.toHaveBeenCalled();
  });
});

describe("window capabilities for close", () => {
  it("grants destroy so onCloseRequested can finish a close", () => {
    const caps = JSON.parse(
      readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8"),
    ) as { permissions: string[] };
    expect(caps.permissions).toContain("core:window:allow-close");
    expect(caps.permissions).toContain("core:window:allow-destroy");
  });
});
