use serde::{Deserialize, Serialize};

fn default_accurate() -> TrimMode {
    TrimMode::Accurate
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrimMode {
    Accurate,
    Fast,
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum ProbeError {
    #[error("no video stream")]
    NoVideoStream,
    #[error("invalid ffprobe json: {0}")]
    InvalidJson(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClipMeta {
    pub path: String,
    pub duration: f64,
    pub fps: f64,
    pub frame_count: u64,
    pub width: u32,
    pub height: u32,
    pub codec_name: String,
    pub pix_fmt: String,
    pub color_transfer: String,
    pub ten_bit: bool,
    pub hdr: bool,
    pub has_video: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrimDonePayload {
    pub ok: bool,
    pub output_path: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    #[serde(default)]
    pub ffmpeg_path: String,
    #[serde(default)]
    pub ffprobe_path: String,
    #[serde(default = "default_accurate")]
    pub trim_mode: TrimMode,
    #[serde(default)]
    pub cpu_only: bool,
    #[serde(default = "default_true")]
    pub open_when_done: bool,
}
