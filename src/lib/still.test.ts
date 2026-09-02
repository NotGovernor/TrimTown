import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { setStillUrl, stillUrl } from "../stores/appStore";
import { requestStill } from "./still";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("requestStill", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue("/9j/");
    setStillUrl(null);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        expect(blob.type).toBe("image/jpeg");
        expect(blob.size).toBe(3);
        return "blob:still";
      }),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("debounces 40ms and only fetches the last frame", async () => {
    requestStill("/clip.mp4", 1, 24);
    requestStill("/clip.mp4", 2, 24);
    requestStill("/clip.mp4", 3, 24);

    expect(mockedInvoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(39);
    expect(mockedInvoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledTimes(1);
    });
    expect(mockedInvoke).toHaveBeenCalledWith("get_still", {
      path: "/clip.mp4",
      frame: 3,
      fps: 24,
    });
    expect(stillUrl()).toBe("blob:still");
  });

  it("settles both promises when a later call supersedes debounce", async () => {
    let firstSettled = false;
    const first = requestStill("/clip.mp4", 1, 24).then(() => {
      firstSettled = true;
    });
    const second = requestStill("/clip.mp4", 2, 24);

    await vi.advanceTimersByTimeAsync(40);
    await second;

    expect(firstSettled).toBe(true);
    await first;
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("get_still", {
      path: "/clip.mp4",
      frame: 2,
      fps: 24,
    });
  });

  it("fetches immediately when debounceMs is 0", async () => {
    const pending = requestStill("/clip.mp4", 10, 30, 0);
    await pending;

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("get_still", {
      path: "/clip.mp4",
      frame: 10,
      fps: 30,
    });
  });

  it("revokes the previous object URL", async () => {
    const create = URL.createObjectURL as ReturnType<typeof vi.fn>;
    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    create.mockReturnValueOnce("blob:old").mockReturnValueOnce("blob:new");

    await requestStill("/clip.mp4", 0, 24, 0);
    expect(stillUrl()).toBe("blob:old");

    await requestStill("/clip.mp4", 1, 24, 0);
    expect(stillUrl()).toBe("blob:new");
    expect(revoke).toHaveBeenCalledWith("blob:old");
  });

  it("ignores still cancelled invoke errors", async () => {
    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    await requestStill("/clip.mp4", 0, 24, 0);
    expect(stillUrl()).toBe("blob:still");
    revoke.mockClear();

    mockedInvoke.mockRejectedValueOnce(new Error("still cancelled"));
    await requestStill("/clip.mp4", 1, 24, 0);

    expect(stillUrl()).toBe("blob:still");
    expect(revoke).not.toHaveBeenCalled();
  });

  it("clears the still url on a hard invoke error", async () => {
    const revoke = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    await requestStill("/clip.mp4", 0, 24, 0);
    expect(stillUrl()).toBe("blob:still");

    mockedInvoke.mockRejectedValueOnce(new Error("ffmpeg failed"));
    await requestStill("/clip.mp4", 1, 24, 0);

    expect(stillUrl()).toBe(null);
    expect(revoke).toHaveBeenCalledWith("blob:still");
  });
});
