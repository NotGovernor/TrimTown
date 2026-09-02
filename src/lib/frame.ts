export function parseRate(s: string): number | undefined {
  const trimmed = s.trim();
  if (trimmed === "") {
    return undefined;
  }
  const slash = trimmed.indexOf("/");
  if (slash >= 0) {
    const num = Number(trimmed.slice(0, slash));
    const den = Number(trimmed.slice(slash + 1));
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
      return undefined;
    }
    const rate = num / den;
    return Number.isFinite(rate) ? rate : undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

export function secondsToFrame(t: number, fps: number, frameCount: number): number {
  const frame = Math.round(t * fps);
  const max = Math.max(0, frameCount - 1);
  return Math.min(Math.max(frame, 0), max);
}

export function formatTimecode(frame: number, fps: number): string {
  const fpsRound = Math.round(fps);
  const ff = fpsRound === 0 ? 0 : frame % fpsRound;
  const totalSecs = fpsRound === 0 ? 0 : Math.floor(frame / fpsRound);
  const hh = Math.floor(totalSecs / 3600);
  const mm = Math.floor((totalSecs % 3600) / 60);
  const ss = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/** Parse `HH:MM:SS:FF`, `HH:MM:SS` (FF=00), or an integer frame index. */
export function parseTimecode(input: string, fps: number): number | undefined {
  const s = input.trim();
  if (s === "") return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  const parts = s.split(":");
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  const fpsRound = Math.round(fps);
  const [hh, mm, ss] = nums;
  const ff = parts.length === 4 ? nums[3] : 0;
  return (hh * 3600 + mm * 60 + ss) * fpsRound + ff;
}
