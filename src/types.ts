export type TrimMode = "accurate" | "fast";

export type AppSettings = {
  ffmpeg_path: string;
  ffprobe_path: string;
  trim_mode: TrimMode;
  cpu_only: boolean;
  open_when_done: boolean;
};

export type ClipMeta = {
  path: string;
  duration: number;
  fps: number;
  frame_count: number;
  width: number;
  height: number;
  codec_name: string;
  pix_fmt: string;
  color_transfer: string;
  ten_bit: boolean;
  hdr: boolean;
  has_video: boolean;
};
