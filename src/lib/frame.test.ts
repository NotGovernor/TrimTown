import { describe, expect, it } from "vitest";
import {
  formatTimecode,
  frameToSeconds,
  parseRate,
  parseTimecode,
  secondsToFrame,
} from "./frame";

describe("parseRate", () => {
  it("parse_rate_fraction", () => {
    const rate = parseRate("30000/1001");
    expect(rate).toBeDefined();
    expect(Math.abs(rate! - 29.97002997)).toBeLessThan(1e-6);
  });

  it("parse_rate_integer", () => {
    expect(parseRate("30")).toBe(30.0);
  });

  it("parse_rate_zero_over_zero_is_none", () => {
    expect(parseRate("0/0")).toBeUndefined();
  });
});

describe("frameToSeconds", () => {
  it("frame_0_is_zero_seconds", () => {
    expect(frameToSeconds(0, 25.0)).toBe(0.0);
  });

  it("frame_25_at_25fps_is_one_second", () => {
    expect(frameToSeconds(25, 25.0)).toBe(1.0);
  });
});

describe("secondsToFrame", () => {
  it("seconds_to_frame_rounds_and_clamps", () => {
    expect(secondsToFrame(-1.0, 24.0, 100)).toBe(0);
    expect(secondsToFrame(99.0, 24.0, 100)).toBe(99);
    expect(secondsToFrame(1.0, 24.0, 100)).toBe(24);
  });
});

describe("formatTimecode", () => {
  it("timecode_zero", () => {
    expect(formatTimecode(0, 24.0)).toBe("00:00:00:00");
  });

  it("timecode_one_hour_ish", () => {
    expect(formatTimecode(86400, 24.0)).toBe("01:00:00:00");
  });

  it("ndf_uses_rounded_fps_for_seconds_not_true_fps", () => {
    const ntsc = 30000 / 1001;
    expect(formatTimecode(8128, ntsc)).toBe("00:04:30:28");
  });

  it("ndf_round_trip_user_reported_in_out_box", () => {
    const ntsc = 30000 / 1001;
    const parsed = parseTimecode("00:04:30:28", ntsc);
    expect(parsed).toBeDefined();
    expect(formatTimecode(parsed!, ntsc)).toBe("00:04:30:28");
  });
});

describe("parseTimecode", () => {
  it("parses integer frame", () => {
    expect(parseTimecode("24", 24)).toBe(24);
    expect(parseTimecode(" 0 ", 24)).toBe(0);
  });

  it("parses HH:MM:SS:FF", () => {
    expect(parseTimecode("00:00:01:00", 24)).toBe(24);
    expect(parseTimecode(formatTimecode(36, 24), 24)).toBe(36);
  });

  it("parses HH:MM:SS as FF 00", () => {
    expect(parseTimecode("00:00:01", 24)).toBe(24);
    expect(parseTimecode("00:04:30", 30)).toBe(30 * 270);
  });

  it("rejects junk", () => {
    expect(parseTimecode("", 24)).toBeUndefined();
    expect(parseTimecode("nope", 24)).toBeUndefined();
    expect(parseTimecode("00:00", 24)).toBeUndefined();
    expect(parseTimecode("00:00:01:00:00", 24)).toBeUndefined();
  });
});
